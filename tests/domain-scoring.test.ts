/**
 * Unit tests: scoring engine + gap generation.
 * Expectations are hand-computed from small fixtures so any drift in the
 * maths fails loudly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessorScoringComplete,
  computeResults,
  itemScoreForCompetency,
  scoreOnlineAnswer,
  scoreRubricItem,
  severityFromGap,
} from "../src/domain/scoring";
import type {
  AssessmentBlueprint,
  Competency,
  EnrichmentItem,
  Question,
  RoleTrack,
} from "../src/domain/types";

/* ----------------------------- fixtures ----------------------------- */

const role: RoleTrack = {
  id: "r", code: "R", title: "Role", technology: "X", description: "", passMark: 70, active: true,
};
const comps: Competency[] = [
  { id: "c1", roleCode: "R", code: "C1", name: "One", group: "g", description: "", weight: 60, threshold: 70, order: 1 },
  { id: "c2", roleCode: "R", code: "C2", name: "Two", group: "g", description: "", weight: 40, threshold: 60, order: 2 },
];
const LEVELS = [
  { score: 0, label: "Zero", descriptor: "" },
  { score: 50, label: "Half", descriptor: "" },
  { score: 100, label: "Full", descriptor: "" },
];
const questions: Question[] = [
  {
    id: "q1", code: "Q1", type: "mcq", roleCode: "R", delivery: "online",
    prompt: "q1", options: [{ id: "a", text: "a" }, { id: "b", text: "b" }],
    expectedAnswer: "a", competencyCodes: ["C1"], weight: 1, difficulty: "foundation", tags: [],
  },
  {
    id: "q2", code: "Q2", type: "mcq", roleCode: "R", delivery: "online",
    prompt: "q2", options: [{ id: "a", text: "a" }, { id: "b", text: "b" }],
    expectedAnswer: "b", competencyCodes: ["C2"], weight: 1, difficulty: "foundation", tags: [],
  },
  {
    id: "q3", code: "Q3", type: "case-study", roleCode: "R", delivery: "assessor",
    prompt: "q3", competencyCodes: ["C1", "C2"], weight: 2, difficulty: "advanced", tags: [],
    rubric: [
      { code: "X", label: "For C1", competencyCode: "C1", weight: 1, levels: LEVELS },
      { code: "Y", label: "For C2", competencyCode: "C2", weight: 1, levels: LEVELS },
    ],
  },
];
const blueprint: AssessmentBlueprint = {
  id: "b", code: "B", roleCode: "R", name: "BP", version: "1", active: true,
  sections: [
    { id: "s1", name: "online", delivery: "online", instructions: "", questionCodes: ["Q1", "Q2"], weight: 1 },
    { id: "s2", name: "deep", delivery: "assessor", instructions: "", questionCodes: ["Q3"], weight: 1 },
  ],
};
const enrichment: EnrichmentItem[] = [
  { id: "e1", roleCode: "R", competencyCode: "C2", title: "Project", type: "project", durationHrs: 10, description: "" },
  { id: "e2", roleCode: "R", competencyCode: "C2", title: "Lab", type: "lab", durationHrs: 5, description: "" },
  { id: "e3", roleCode: "R", competencyCode: "C2", title: "Reading", type: "reading", durationHrs: 2, description: "" },
  { id: "e4", roleCode: "R", competencyCode: "C2", title: "Reading2", type: "reading", durationHrs: 1, description: "" },
];

function run(opts: Partial<Parameters<typeof computeResults>[0]> = {}) {
  return computeResults({
    role,
    competencies: opts.competencies ?? comps,
    blueprint: opts.blueprint ?? blueprint,
    questions: opts.questions ?? questions,
    onlineAnswers: opts.onlineAnswers ?? [
      { questionCode: "Q1", selected: ["a"], autoScore: 100, correct: true },
      { questionCode: "Q2", selected: ["a"], autoScore: 0, correct: false },
    ],
    assessorScores: opts.assessorScores ?? [
      { questionCode: "Q3", criterionScores: { X: 100, Y: 0 }, itemScore: 50, evidence: "ok" },
    ],
    enrichment: opts.enrichment ?? enrichment,
  });
}

/* ------------------------- item-level scoring ----------------------- */

test("mcq auto-scoring", () => {
  assert.deepEqual(scoreOnlineAnswer(questions[0], ["a"]), { score: 100, correct: true });
  assert.deepEqual(scoreOnlineAnswer(questions[0], ["b"]), { score: 0, correct: false });
  // multiple selections on a single-choice item never score
  assert.deepEqual(scoreOnlineAnswer(questions[0], ["a", "b"]), { score: 0, correct: false });
  assert.deepEqual(scoreOnlineAnswer(questions[0], []), { score: 0, correct: false });
});

test("multi-select partial credit with miss penalty", () => {
  const q: Question = { ...questions[0], type: "multi-select", expectedAnswer: "a,c" };
  assert.deepEqual(scoreOnlineAnswer(q, ["a", "c"]), { score: 100, correct: true }); // exact
  assert.deepEqual(scoreOnlineAnswer(q, ["a"]), { score: 50, correct: false }); // partial
  assert.deepEqual(scoreOnlineAnswer(q, ["a", "b"]), { score: 0, correct: false }); // hit cancelled by miss
  assert.deepEqual(scoreOnlineAnswer(q, ["a", "b", "d"]), { score: 0, correct: false }); // floored at 0
  const noKey: Question = { ...questions[0], type: "multi-select", expectedAnswer: "" };
  assert.equal(scoreOnlineAnswer(noKey, ["a"]).score, 0); // unscorable -> 0, never crash
});

test("rubric item scoring honours criterion weights", () => {
  const q: Question = {
    ...questions[2],
    rubric: [
      { code: "A", label: "a", weight: 1, levels: LEVELS },
      { code: "B", label: "b", weight: 3, levels: LEVELS },
    ],
  };
  assert.equal(scoreRubricItem(q, { A: 100, B: 0 }), 25); // (100*1 + 0*3) / 4
  assert.equal(scoreRubricItem(q, { A: 100, B: 100 }), 100);
  assert.equal(scoreRubricItem(q, {}), 0); // nothing scored
  assert.equal(scoreRubricItem({ ...q, rubric: [] }, {}), 0); // no rubric
});

test("criterion->competency routing weights the item share, unmapped tags get overall score", () => {
  // Q3 weight 2 x section weight 1; criteria split 50/50 between C1 and C2
  assert.deepEqual(itemScoreForCompetency(questions[2], { questionCode: "Q3", criterionScores: { X: 100, Y: 0 } }, undefined, 1, "C1"), { score: 100, weight: 1 });
  assert.deepEqual(itemScoreForCompetency(questions[2], { questionCode: "Q3", criterionScores: { X: 100, Y: 0 } }, undefined, 1, "C2"), { score: 0, weight: 1 });
  // auto-scored item
  assert.deepEqual(itemScoreForCompetency(questions[0], undefined, 100, 1, "C1"), { score: 100, weight: 1 });
  // nothing available
  assert.deepEqual(itemScoreForCompetency(questions[0], undefined, undefined, 1, "C1"), { score: 0, weight: 0 });
});

/* ------------------------ assessment computation -------------------- */

test("scenario A: mixed performance - exact competency/readiness/outcome", () => {
  const r = run();
  // C1 = Q1(100,w1) + Q3->X(100,w1) = 100 ; C2 = Q2(0,w1) + Q3->Y(0,w1) = 0
  const c1 = r.competencyResults.find((c) => c.competencyCode === "C1")!;
  const c2 = r.competencyResults.find((c) => c.competencyCode === "C2")!;
  assert.equal(c1.score, 100);
  assert.equal(c1.status, "meets");
  assert.equal(c2.score, 0);
  assert.equal(c2.status, "gap_critical"); // threshold 60 - score 0 = 60 > 25
  assert.equal(r.readinessScore, 60); // (100*60 + 0*40) / 100
  assert.equal(r.outcome, "enrichment_required"); // gaps exist, readiness 60 >= 70-15
  assert.equal(r.gaps.length, 1);
  assert.equal(r.gaps[0].severity, "critical");
  assert.deepEqual(r.strengths, ["One (100)"]);
  assert.deepEqual(r.developmentAreas, ["Two (0 vs required 60)"]);
});

test("gap recommendations are capped at 3 and ranked hands-on first", () => {
  const r = run();
  assert.equal(r.gaps[0].recommendations.length, 3);
  assert.deepEqual(
    r.gaps[0].recommendations.map((x) => x.type),
    ["project", "lab", "reading"],
  );
});

test("not-assessed competency: excluded from readiness, forces not_ready", () => {
  const r = run({
    blueprint: { ...blueprint, sections: blueprint.sections.filter((s) => s.id !== "s1") },
    onlineAnswers: [],
  });
  // C2 still has the Q3->Y criterion, scored 0 -> gap, not "not_assessed"
  assert.equal(r.competencyResults.find((c) => c.name === "Two")!.status, "gap_critical");
  const r2 = run({
    competencies: [
      comps[0],
      { ...comps[1], code: "C3", name: "Three" },
    ],
    blueprint: { ...blueprint, sections: blueprint.sections.filter((s) => s.id !== "s1") },
    onlineAnswers: [],
  });
  const orphan = r2.competencyResults.find((c) => c.competencyCode === "C3")!;
  assert.equal(orphan.status, "not_assessed");
  assert.equal(r2.outcome, "not_ready");
  assert.ok(r2.developmentAreas.some((d) => d.includes("not assessed")));
  // readiness only over assessed competency (C1 items: Q3->X=100)
  assert.equal(r2.readinessScore, 100);
});

test("outcome boundaries: exactly passMark-15 -> enrichment_required, one below -> not_ready", () => {
  const single: Competency[] = [
    { id: "c", roleCode: "R", code: "C", name: "C", group: "g", description: "", weight: 100, threshold: 60, order: 1 },
  ];
  const qC: Question = { ...questions[0], code: "QC", competencyCodes: ["C"] };
  const bp: AssessmentBlueprint = {
    ...blueprint,
    sections: [{ id: "s1", name: "online", delivery: "online", instructions: "", questionCodes: ["QC"], weight: 1 }],
  };
  const mk = (score: number) =>
    run({ competencies: single, questions: [qC], blueprint: bp, onlineAnswers: [{ questionCode: "QC", selected: ["a"], autoScore: score, correct: score === 100 }], assessorScores: [] });
  // readiness 55 with a gap: 55 >= 70-15 -> enrichment_required
  assert.equal(mk(55).outcome, "enrichment_required");
  // readiness 54 -> not_ready
  assert.equal(mk(54).outcome, "not_ready");
});

test("perfect run: readiness 100, no gaps, ready_pending_validation", () => {
  const r = run({
    onlineAnswers: [
      { questionCode: "Q1", selected: ["a"], autoScore: 100, correct: true },
      { questionCode: "Q2", selected: ["b"], autoScore: 100, correct: true },
    ],
    assessorScores: [{ questionCode: "Q3", criterionScores: { X: 100, Y: 100 }, itemScore: 100 }],
  });
  assert.equal(r.readinessScore, 100);
  assert.equal(r.gaps.length, 0);
  assert.equal(r.outcome, "ready_pending_validation");
});

test("readiness above pass mark with one gap is still enrichment_required (no weak spots rule)", () => {
  const r = run({
    competencies: [
      { ...comps[0], weight: 90 },
      { ...comps[1], threshold: 5, weight: 10 }, // nearly met but missed
    ],
    onlineAnswers: [
      { questionCode: "Q1", selected: ["a"], autoScore: 100, correct: true },
      { questionCode: "Q2", selected: ["a"], autoScore: 0, correct: false },
    ],
    assessorScores: [{ questionCode: "Q3", criterionScores: { X: 100, Y: 0 }, itemScore: 50 }],
  });
  assert.ok(r.readinessScore >= r.passMark); // 90 vs pass mark 70
  assert.equal(r.outcome, "enrichment_required");
  assert.equal(r.gaps[0].severity, "minor"); // 5 - 0 = 5 <= 10
});

test("severity boundaries", () => {
  assert.equal(severityFromGap(1), "minor");
  assert.equal(severityFromGap(10), "minor");
  assert.equal(severityFromGap(11), "major");
  assert.equal(severityFromGap(25), "major");
  assert.equal(severityFromGap(26), "critical");
});

/* ----------------------- scoring completeness ----------------------- */

test("assessorScoringComplete: criteria + mandatory case-study evidence", () => {
  const byCode = new Map(questions.map((q) => [q.code, q]));
  const ok = [{ questionCode: "Q3", criterionScores: { X: 100, Y: 50 }, evidence: "said the right things" }];
  assert.deepEqual(assessorScoringComplete(blueprint, byCode, ok), { complete: true, missing: [] });
  assert.equal(assessorScoringComplete(blueprint, byCode, [{ questionCode: "Q3", criterionScores: { X: 100 }, evidence: "x" }]).complete, false);
  assert.equal(assessorScoringComplete(blueprint, byCode, [{ questionCode: "Q3", criterionScores: { X: 100, Y: 0 } }]).complete, false); // no evidence
  assert.equal(assessorScoringComplete(blueprint, byCode, []).missing.includes("Q3"), true);
});
