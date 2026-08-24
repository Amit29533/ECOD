/**
 * Integration tests: service layer (the workflow boundary) on a throwaway store.
 * Exercises the same code the UI and API use - happy paths AND every guard.
 */

process.env.DATA_FILE = (() => {
  // NOTE: safe as a plain statement - imported modules never touch the adapter
  // at load time; the first getAdapter() call happens inside test bodies.
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return join(mkdtempSync(join(tmpdir(), "ecod-svc-")), "store.json");
})();
process.env.SESSION_SECRET = "integration-test";
process.env.ECOD_CONTENT_WRITEBACK = "0"; // never mutate the repo's /content

import { test } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../src/lib/services";
const { ServiceError } = svc;

const expectError = async (fn: () => Promise<unknown>, status: number, msgIncludes?: string) => {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof ServiceError, `expected ServiceError, got ${err}`);
    assert.equal((err as any).status, status, `expected ${status}, got ${(err as any).status}: ${err}`);
    if (msgIncludes) assert.ok((err as Error).message.includes(msgIncludes), `message "${err.message}" should include "${msgIncludes}"`);
    return;
  }
  assert.fail(`expected ServiceError ${status}, but call succeeded`);
};

/* ------------------------------ bootstrap --------------------------- */

test("bootstrap seeds content + users (but not demo candidates)", async () => {
  await svc.ensureSeeded();
  assert.equal((await svc.getContent("roles")).length, 1);
  assert.equal((await svc.getContent("competencies")).length, 8);
  assert.equal((await svc.getContent("questions")).length, 17);
  assert.equal((await svc.getContent("blueprints")).length, 1);
  assert.equal((await svc.getContent("enrichment")).length, 12);
  assert.equal((await svc.listUsers()).length, 5);
  const admin = await svc.findUserByEmail("ADMIN@ECOD.IO"); // case-insensitive
  assert.equal(admin!.role, "admin");
  assert.equal(await svc.findUserByEmail("ghost@ecod.io"), null);
});

test("seeding is idempotent", async () => {
  await svc.ensureSeeded();
  await svc.ensureSeeded();
  assert.equal((await svc.listUsers()).length, 5);
});

/* ------------------------------ candidates -------------------------- */

test("candidate intake: creates with defaults, rejects duplicate email, pool is admin-only", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const assessor = (await svc.findUserByEmail("kavitha.rao@ecod.io"))!;
  const c = await svc.createCandidate({
    name: "Test One", email: "ONE@x.io", skills: ["a", "b"], technologies: ["Databricks"],
    internal: { rating: "A" },
  });
  assert.equal(c.status, "intake");
  assert.equal(c.code, "CAND-1001");
  assert.equal(c.email, "one@x.io"); // normalised
  assert.deepEqual(c.skills, ["a", "b"]);
  await expectError(() => svc.createCandidate({ name: "Dup", email: "one@x.io" }), 400, "already exists");
  assert.equal((await svc.listCandidates(admin)).length, 1);
  await expectError(() => svc.listCandidates(assessor), 403);
  await expectError(() => svc.listCandidates({ ...admin, role: "candidate" }), 403);
});

/* ------------------------- assessment creation ---------------------- */

test("assessment creation validates role, blueprint, assessor and updates candidate status", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const kavitha = (await svc.findUserByEmail("kavitha.rao@ecod.io"))!;
  const cand = (await svc.listCandidates(admin))[0];

  await expectError(() => svc.createAssessment({ candidateId: "ghost", roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id }), 404, "Candidate");
  await expectError(() => svc.createAssessment({ candidateId: cand.id, roleCode: "NOPE", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id }), 404, "Role");
  await expectError(() => svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "NOPE", assessorId: kavitha.id }), 404, "Blueprint");
  // wrong role blueprint for role
  const bps = (await svc.getContent("blueprints")) as any[];
  await svc.saveContent("blueprints", [
    ...bps,
    { ...bps[0], id: "bp-wrong-role", code: "WRONG-ROLE", roleCode: "OTHER" },
  ]);
  await expectError(() => svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "WRONG-ROLE", assessorId: kavitha.id }), 404, "Blueprint");
  // admin is not an assessor
  await expectError(() => svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: admin.id }), 400, "assessor");
  // inactive assessor
  const store = (await import("../src/data/adapter")).getAdapter();
  await store.put("users", { ...kavitha, active: false });
  await expectError(() => svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id }), 400, "active assessor");
  await store.put("users", { ...kavitha, active: true });

  const a = await svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id });
  assert.equal(a.status, "allocated");
  assert.equal(a.code, "ASMT-2001");
  assert.equal((await svc.getCandidateById(cand.id))!.status, "in_assessment");
});

/* ------------------------------ online ------------------------------ */

const CORRECT: Record<string, string> = {
  "Q-RSA-001": "b", "Q-RSA-002": "b", "Q-RSA-003": "b", "Q-RSA-004": "b",
  "Q-RSA-005": "b", "Q-RSA-006": "a", "Q-RSA-007": "b", "Q-RSA-008": "b",
  "Q-RSA-009": "a", "Q-RSA-010": "c", "Q-RSA-011": "b", "Q-RSA-012": "b",
};
const answersFor = (override: Record<string, string> = {}) =>
  Object.entries({ ...CORRECT, ...override }).map(([questionCode, selected]) => ({ questionCode, selected: [selected] }));

test("online submission: authorisation, partial vs complete, integrity lock", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const kavitha = (await svc.findUserByEmail("kavitha.rao@ecod.io"))!;
  const cand = (await svc.listCandidates(admin))[0];
  const assessment = (await svc.listAssessmentsFor(admin))[0];

  // candidate user is created via the same service the API uses
  const candUser = await svc.createUser({ name: cand.name, email: cand.email, role: "candidate", password: "cand-pass-123" });
  const outsider = await svc.createUser({ name: "Outsider", email: "outsider@x.io", role: "candidate", password: "cand-pass-123" });

  await expectError(() => svc.submitOnlineAnswers(kavitha, assessment.id, answersFor()), 403, "Only candidates");
  await expectError(() => svc.submitOnlineAnswers(outsider, assessment.id, answersFor()), 403, "not your assessment");
  await expectError(() => svc.submitOnlineAnswers(candUser, "ghost-id", answersFor()), 404);

  // partial: 11 of 12 -> in progress, and the wrong one scores 0
  const partial = answersFor({ "Q-RSA-004": "a" }).slice(0, 11);
  let updated = await svc.submitOnlineAnswers(candUser, assessment.id, partial);
  assert.equal(updated.status, "online_in_progress");
  assert.equal(updated.onlineAnswers.length, 11);
  assert.equal(updated.onlineAnswers.find((x) => x.questionCode === "Q-RSA-004")!.autoScore, 0);

  // complete: all 12 -> complete, correct count 11, online average 92 (11*100/12 rounded)
  updated = await svc.submitOnlineAnswers(candUser, assessment.id, answersFor({ "Q-RSA-004": "a" }));
  assert.equal(updated.status, "online_complete");
  assert.equal(updated.onlineAnswers.filter((x) => x.correct).length, 11);
  const avg = Math.round(updated.onlineAnswers.reduce((s, x) => s + (x.autoScore ?? 0), 0) / 12);
  assert.equal(avg, 92);

  // integrity lock: no resubmission after completion
  await expectError(() => svc.submitOnlineAnswers(candUser, assessment.id, answersFor()), 409, "already submitted");

  // unknown question codes in the payload are ignored, not fatal
  const withJunk = [...answersFor({ "Q-RSA-006": "z" }), { questionCode: "Q-FAKE-999", selected: ["a"] }];
  const fresh = await svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id });
  const done = await svc.submitOnlineAnswers(candUser, fresh.id, withJunk);
  assert.equal(done.status, "online_complete");
  assert.equal(done.onlineAnswers.find((x) => x.questionCode === "Q-RSA-006")!.autoScore, 0);
});

/* ------------------------------ scoring ----------------------------- */

const FULL_SCORES: { questionCode: string; criterionScores: Record<string, number>; evidence: string }[] = [
  { questionCode: "Q-RSA-101", criterionScores: { QUALITY: 70 }, evidence: "e" },
  { questionCode: "Q-RSA-102", criterionScores: { QUALITY: 70 }, evidence: "e" },
  { questionCode: "Q-RSA-103", criterionScores: { QUALITY: 70 }, evidence: "e" },
  { questionCode: "Q-RSA-201", criterionScores: { REQ: 100, ARCH: 100, GOV: 70, MIG: 70, COMMS: 100 }, evidence: "e" },
  { questionCode: "Q-RSA-202", criterionScores: { STREAM: 70, SCALE: 70, COST: 70, OPS: 70 }, evidence: "e" },
];

test("scoring: wrong assessor rejected, incomplete/missing-evidence rejected, happy path closes the loop", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const marcus = (await svc.findUserByEmail("marcus.lin@ecod.io"))!;
  const kavitha = (await svc.findUserByEmail("kavitha.rao@ecod.io"))!;
  const assessments = await svc.listAssessmentsFor(admin);
  const target = assessments.find((a) => a.status === "online_complete" && a.code === "ASMT-2001")!;

  await expectError(() => svc.submitAssessorScores(marcus, target.id, FULL_SCORES), 403, "allocated assessor");
  await expectError(() => svc.submitAssessorScores(admin, target.id, FULL_SCORES), 403);
  await expectError(() => svc.submitAssessorScores(kavitha, "ghost", FULL_SCORES), 404);
  // incomplete criteria
  await expectError(() => svc.submitAssessorScores(kavitha, target.id, FULL_SCORES.slice(0, 4)), 400, "Incomplete");
  // missing evidence on a case study
  const noEvidence = FULL_SCORES.map((s) => (s.questionCode === "Q-RSA-201" ? { ...s, evidence: undefined } : s));
  await expectError(() => svc.submitAssessorScores(kavitha, target.id, noEvidence), 400, "Incomplete");
  // unknown question in payload
  await expectError(() => svc.submitAssessorScores(kavitha, target.id, [...FULL_SCORES, { questionCode: "Q-FAKE", criterionScores: {} }]), 400, "Unknown question");
  // scoring blocked before the online section is submitted
  const cand2 = await svc.createCandidate({ name: "Not Ready", email: "notready@x.io" });
  const waiting = await svc.createAssessment({ candidateId: cand2.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id });
  await expectError(() => svc.submitAssessorScores(kavitha, waiting.id, FULL_SCORES), 409);

  const scored = await svc.submitAssessorScores(kavitha, target.id, FULL_SCORES);
  assert.equal(scored.status, "gap_mapped");
  assert.ok(scored.results);
  const r = scored.results!;
  // deterministic: candidate scored 11/12 online (missed Q-RSA-004) + these rubric levels.
  // Verified item-by-item: PLATFORM 100, GOV 81, DELTA 54, DATAENG 88, STREAMING 83,
  // SQLPERF 83, CLOUDSEC 88, ARCHCONSULT 85 -> weighted readiness = 82.
  assert.equal(r.readinessScore, 82);
  assert.equal(r.passMark, 70);
  assert.equal(r.outcome, "enrichment_required"); // one gap: DELTA below threshold
  assert.equal(r.competencyResults.length, 8);
  const delta = r.competencyResults.find((c) => c.competencyCode === "RSA.DELTA")!;
  assert.equal(delta.score, 54);
  assert.equal(delta.status, "gap_major"); // 70 - 54 = 16
  assert.equal(r.gaps.length, 1);
  assert.equal(r.gaps[0].competencyCode, "RSA.DELTA");
  assert.ok(r.summary.length > 0);
  // candidate status advanced
  const cand = await svc.getCandidateById(target.candidateId);
  assert.equal(cand!.status, "gap_mapped");
  // double scoring rejected
  await expectError(() => svc.submitAssessorScores(kavitha, target.id, FULL_SCORES), 409);
});

test("scoring invariants: gaps match competency results; recommendations come from the catalogue", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const scored = (await svc.listAssessmentsFor(admin)).find((a) => a.results && a.code === "ASMT-2001")!;
  const r = scored.results!;
  for (const g of r.gaps) {
    const c = r.competencyResults.find((x) => x.competencyCode === g.competencyCode)!;
    assert.ok(c.score < c.threshold, "gap must correspond to unmet competency");
    assert.equal(g.score, c.score);
    assert.equal(g.threshold, c.threshold);
    assert.ok(g.recommendations.length >= 1);
    assert.ok(g.recommendations.length <= 3);
  }
  for (const c of r.competencyResults.filter((x) => x.status === "meets")) {
    assert.equal(r.gaps.find((g) => g.competencyCode === c.competencyCode), undefined);
  }
  assert.equal(new Set(r.competencyResults.map((c) => c.competencyCode)).size, 8);
});

/* --------------------- blueprint without online --------------------- */

test("blueprint with no online section: assessor can score directly from allocated", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const kavitha = (await svc.findUserByEmail("kavitha.rao@ecod.io"))!;
  const bps = (await svc.getContent("blueprints")) as any[];
  await svc.saveContent("blueprints", [
    ...bps,
    {
      id: "bp-noonline", code: "RSA-DEEP-V1", roleCode: "RSA", name: "Deep-dive only", version: "1",
      sections: [{ id: "s", name: "Deep", delivery: "assessor", instructions: "", questionCodes: ["Q-RSA-101", "Q-RSA-102", "Q-RSA-103"], weight: 1 }],
      active: true,
    },
  ]);
  const cand = await svc.createCandidate({ name: "Deep Only", email: "deep@x.io" });
  const a = await svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "RSA-DEEP-V1", assessorId: kavitha.id });
  assert.equal(a.status, "allocated");
  const scored = await svc.submitAssessorScores(kavitha, a!.id, [
    { questionCode: "Q-RSA-101", criterionScores: { QUALITY: 100 }, evidence: "e" },
    { questionCode: "Q-RSA-102", criterionScores: { QUALITY: 100 }, evidence: "e" },
    { questionCode: "Q-RSA-103", criterionScores: { QUALITY: 100 }, evidence: "e" },
  ]);
  // competencies without items in this blueprint -> not_assessed -> not_ready
  assert.equal(scored.results!.outcome, "not_ready");
  assert.ok(scored.results!.developmentAreas.some((d) => d.includes("not assessed")));
});

/* ----------------------------- recompute ---------------------------- */

test("recompute: guarded before scoring, idempotent after, tracks threshold edits", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const kavitha = (await svc.findUserByEmail("kavitha.rao@ecod.io"))!;
  const cand = await svc.createCandidate({ name: "Recompute Guard", email: "guard@x.io" });
  const fresh = await svc.createAssessment({ candidateId: cand.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id });
  await expectError(() => svc.recomputeAssessment(fresh.id), 409, "not fully scored");
  await expectError(() => svc.recomputeAssessment("ghost"), 404);

  const all = await svc.listAssessmentsFor(admin);
  const scored = all.find((a) => a.results && a.code === "ASMT-2001")!;
  const again = await svc.recomputeAssessment(scored.id);
  assert.equal(again.results!.readinessScore, scored.results!.readinessScore); // idempotent

  // raise a threshold above the achieved score -> gap appears on recompute
  const comps = (await svc.getContent("competencies")) as any[];
  await svc.saveContent("competencies", comps.map((c) => (c.code === "RSA.ARCHCONSULT" ? { ...c, threshold: 100 } : c)));
  const recomputed = await svc.recomputeAssessment(scored.id);
  assert.ok(recomputed.results!.gaps.some((g) => g.competencyCode === "RSA.ARCHCONSULT"));
  // restore
  await svc.saveContent("competencies", comps);
});

/* ------------------------- content validation ----------------------- */

test("content editor rejects malformed records instead of poisoning the engine", async () => {
  const roles = (await svc.getContent("roles")) as any[];
  await expectError(() => svc.saveContent("roles", [] as any), 400, "empty"); // wipe guard
  await expectError(() => svc.saveContent("roles", "nope" as any), 400);
  await expectError(() => svc.saveContent("roles", [{ id: 42 }]), 400); // id must be string
  await expectError(() => svc.saveContent("competencies", [{ id: "x", code: "C", roleCode: "RSA", name: "n", weight: 10 }]), 400, "threshold");
  await expectError(() => svc.saveContent("competencies", [{ id: "x", code: "C", roleCode: "RSA", name: "n", weight: "ten", threshold: 5 }]), 400, "weight");
  await expectError(() => svc.saveContent("questions", [{ id: "x", code: "Q", type: "telepathy", roleCode: "RSA", delivery: "online", competencyCodes: ["C"] }]), 400, "type");
  await expectError(() => svc.saveContent("questions", [{ id: "x", code: "Q", type: "mcq", roleCode: "RSA", delivery: "online", competencyCodes: [], options: [{ id: "a", text: "a" }], expectedAnswer: "a" }]), 400, "options");
  await expectError(() => svc.saveContent("questions", [{ id: "x", code: "Q", type: "case-study", roleCode: "RSA", delivery: "assessor", competencyCodes: ["C"] }]), 400, "rubric");
  await expectError(() => svc.saveContent("blueprints", [{ id: "x", code: "B", roleCode: "RSA", name: "n", sections: [{ id: "s", questionCodes: "Q-RSA-101" }] }]), 400, "questionCodes");
  await expectError(() => svc.saveContent("enrichment", [{ id: "x", roleCode: "RSA" }]), 400, "competencyCode");
  // valid save persists
  await svc.saveContent("roles", roles);
  assert.equal((await svc.getRoleByCode("RSA"))!.passMark, 70);
});

/* ----------------------- users & compartment ------------------------ */

test("user management: duplicate email + role validation", async () => {
  await svc.createUser({ name: "New Assessor", email: "new.assessor@ecod.io", role: "assessor", password: "longenough1" });
  await expectError(() => svc.createUser({ name: "Dup", email: "new.assessor@ecod.io", role: "assessor", password: "longenough1" }), 400, "already exists");
});

test("compartmentalisation: assessor view strips internal; candidate sees only own", async () => {
  const admin = (await svc.findUserByEmail("admin@ecod.io"))!;
  const kavitha = (await svc.findUserByEmail("kavitha.rao@ecod.io"))!;
  const scored = (await svc.listAssessmentsFor(admin)).find((a) => a.results && a.code === "ASMT-2001")!;
  const forAdmin = await svc.getAssessmentView(admin, scored.id);
  const forAssessor = await svc.getAssessmentView(kavitha, scored.id);
  assert.equal(forAdmin!.candidate.internal!.rating, "A");
  assert.equal("internal" in forAssessor!.candidate, false);
  // candidate not involved in this assessment is denied
  const outsider = (await svc.listUsers()).find((u) => u.email === "outsider@x.io")!;
  await expectError(() => svc.getAssessmentView(outsider, scored.id), 403);
  // scoped listing
  const kavithaList = await svc.listAssessmentsFor(kavitha);
  assert.ok(kavithaList.every((a) => a.assessorId === kavitha.id));
  const marcus = (await svc.findUserByEmail("marcus.lin@ecod.io"))!;
  assert.equal((await svc.listAssessmentsFor(marcus)).length, 0);
});

test("dashboard stats reflect the seeded flow", async () => {
  const stats = await svc.dashboardStats();
  assert.ok(stats.totalCandidates >= 3);
  assert.ok(stats.totalAssessments >= 3);
  assert.ok(Object.values(stats.assessmentStatus).reduce((a, b) => a + b, 0) === stats.totalAssessments);
  assert.ok(stats.avgReadiness !== null && stats.avgReadiness >= 0 && stats.avgReadiness <= 100);
  assert.ok(stats.openGaps >= 1);
});
