/**
 * Headless end-to-end proof: one RSA candidate flows the whole Assessment
 * Module using the real service layer on a throwaway data file.
 *
 *   npm run demo:e2e
 *
 * Steps exercised:
 *   1. content + users bootstrap
 *   2. candidate intake
 *   3. role mapping + assessor allocation
 *   4. candidate submits knowledge check (auto-scored)
 *   5. assessor submits rubric scores
 *   6. engine computes competency scores, readiness, outcome
 *   7. capability gaps + enrichment recommendations generated
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// throwaway store - never touches ./data/ecod.json
process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), "ecod-e2e-")), "demo.json");

async function main() {
  const svc = await import("../src/lib/services");
  const { getAdapter } = await import("../src/data/adapter");

  const bar = (t: string) => console.log(`\n── ${t} ${"─".repeat(Math.max(1, 64 - t.length))}`);

  bar("1. bootstrap (content, competencies, questions, users)");
  await svc.ensureSeeded();
  console.log("   content synced · users seeded (admin, 2 assessors, 2 candidates)");

  bar("2. candidate intake");
  const candidate = await svc.createCandidate({
    name: "Demo Candidate",
    email: "demo.candidate@example.io",
    currentRole: "Lead Data Engineer",
    yearsExperience: 10,
    skills: ["PySpark", "SQL", "Kafka"],
    technologies: ["Databricks", "Azure"],
    cvSummary: "E2E demo candidate.",
    internal: { commercialTerms: "demo rate card", rating: "A" },
  });
  console.log(`   ${candidate.code} — ${candidate.name} (status: ${candidate.status})`);

  bar("3. role mapping + assessor allocation");
  const assessor = await svc.findUserByEmail("kavitha.rao@ecod.io");
  const candidateUser = await svc.createUser({
    name: "Demo Candidate",
    email: "demo.candidate@example.io",
    role: "candidate",
    password: "demo-pass-123",
  });
  const assessment = await svc.createAssessment({
    candidateId: candidate.id,
    roleCode: "RSA",
    blueprintCode: "RSA-STD-V1",
    assessorId: assessor!.id,
  });
  console.log(`   ${assessment.code} — RSA / RSA-STD-V1, assessor: ${assessor!.name} (status: ${assessment.status})`);

  bar("4. candidate submits knowledge check (auto-scored)");
  const answers: Record<string, string> = {
    "Q-RSA-001": "b", "Q-RSA-002": "b", "Q-RSA-003": "b", "Q-RSA-004": "a",
    "Q-RSA-005": "b", "Q-RSA-006": "a", "Q-RSA-007": "b", "Q-RSA-008": "a",
    "Q-RSA-009": "a", "Q-RSA-010": "c", "Q-RSA-011": "b", "Q-RSA-012": "b",
  };
  const submitted = await svc.submitOnlineAnswers(
    candidateUser,
    assessment.id,
    Object.entries(answers).map(([questionCode, selected]) => ({ questionCode, selected: [selected] })),
  );
  const onlineScore = Math.round(submitted.onlineAnswers.reduce((s, a) => s + (a.autoScore ?? 0), 0) / submitted.onlineAnswers.length);
  console.log(`   submitted ${submitted.onlineAnswers.length} answers · online average ${onlineScore}/100 (status: ${submitted.status})`);

  bar("5. assessor submits rubric scores (deep-dive + case studies)");
  const scored = await svc.submitAssessorScores(assessor!, assessment.id, [
    { questionCode: "Q-RSA-101", criterionScores: { QUALITY: 70 }, evidence: "Competent pipeline design." },
    { questionCode: "Q-RSA-102", criterionScores: { QUALITY: 100 }, evidence: "Excellent UC migration mastery." },
    { questionCode: "Q-RSA-103", criterionScores: { QUALITY: 40 }, evidence: "Streaming depth lacking." },
    { questionCode: "Q-RSA-201", criterionScores: { REQ: 70, ARCH: 100, GOV: 70, MIG: 70, COMMS: 100 }, evidence: "Architecturally strong, exec-ready." },
    { questionCode: "Q-RSA-202", criterionScores: { STREAM: 40, SCALE: 40, COST: 70, OPS: 70 }, evidence: "Streaming weak; cost/ops fine." },
  ]);
  console.log(`   scored (status: ${scored.status})`);

  bar("6. results — competency scores vs thresholds");
  const results = scored.results!;
  console.table(
    results.competencyResults.reduce<Record<string, any>>((acc, c) => {
      acc[c.name] = { score: c.score, required: c.threshold, weight: `${c.weight}%`, status: c.status };
      return acc;
    }, {}),
  );
  console.log(`   readiness: ${results.readinessScore}/100 (pass mark ${results.passMark}) → outcome: ${results.outcome}`);

  bar("7. capability gaps + enrichment");
  if (results.gaps.length === 0) {
    console.log("   none — candidate meets every competency threshold");
  } else {
    for (const g of results.gaps) {
      console.log(`   • ${g.name}: ${g.score}/${g.threshold} (gap ${g.gap}, ${g.severity})`);
      for (const r of g.recommendations) console.log(`       → ${r.title} [${r.type}${r.durationHrs ? `, ${r.durationHrs}h` : ""}]`);
    }
  }

  bar("compartmentalisation check (assessor view of candidate)");
  const store = getAdapter();
  const full = await store.get<any>("candidates", candidate.id);
  console.log(`   admin record has internal.commercialTerms: ${Boolean(full.internal?.commercialTerms)}`);
  const { sanitizeCandidate } = await import("../src/domain/rbac");
  const sanitized = sanitizeCandidate(full, "assessor");
  console.log(`   assessor view has internal stripped: ${!("internal" in sanitized)}`);

  console.log("\n✔ end-to-end flow complete.\n");
}

main().catch((err) => {
  console.error("e2e demo failed:", err);
  process.exit(1);
});
