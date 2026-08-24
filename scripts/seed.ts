/**
 * Seed / demo bootstrap.
 *
 *   npm run seed         - idempotent: syncs content, users, demo candidates
 *   npm run seed:reset   - wipes the local store and rebuilds everything,
 *                          including running Priya's assessment to completion
 *                          so dashboards/gap reports have data on first login.
 *
 * Uses the SAME service layer as the UI and API - the demo is therefore a
 * faithful exercise of the production workflow, not a shortcut.
 */

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    const file = resolve(process.cwd(), process.env.DATA_FILE ?? "./data/ecod.json");
    if (existsSync(file)) {
      rmSync(file);
      console.log(`· removed ${file}`);
    }
    process.env.__ECOD_SKIP_AUTOSEED__ = "1";
  }

  const { getAdapter } = await import("../src/data/adapter");
  const svc = await import("../src/lib/services");
  const { ensureSeeded } = svc;

  console.log("· syncing domain content + users");
  await ensureSeeded();
  const store = getAdapter();

  // ---- demo candidates -------------------------------------------------
  const seedCandidates = (
    await import("node:fs")
  ).readFileSync(resolve(process.cwd(), "content/seed-candidates.json"), "utf8");
  const specs = JSON.parse(seedCandidates) as any[];

  const ids: Record<string, string> = {};
  for (const spec of specs) {
    let candidate = await store.findOne<any>("candidates", "email", spec.email);
    if (!candidate) {
      const { internal, ...rest } = spec;
      candidate = await svc.createCandidate({ ...rest, internal });
      if (internal) {
        candidate.internal = internal;
        candidate = await store.put("candidates", candidate);
      }
      console.log(`· created candidate ${candidate.code} — ${candidate.name}`);
    }
    ids[spec.id] = candidate.id;
  }

  const admin = await svc.findUserByEmail("admin@ecod.io");
  const kavitha = await svc.findUserByEmail("kavitha.rao@ecod.io");
  const marcus = await svc.findUserByEmail("marcus.lin@ecod.io");
  const priyaCandidate = await store.findOne<any>("candidates", "email", "priya.nair@example.io");
  const arjunCandidate = await store.findOne<any>("candidates", "email", "arjun.mehta@example.io");

  // ---- Arjun: allocated, waiting for him to take the online check -------
  const existingArjun = (await store.list<any>("assessments")).find(
    (a) => a.candidateId === arjunCandidate?.id,
  );
  if (!existingArjun && arjunCandidate && marcus) {
    await svc.createAssessment({
      candidateId: arjunCandidate.id,
      roleCode: "RSA",
      blueprintCode: "RSA-STD-V1",
      assessorId: marcus.id,
    });
    console.log("· created Arjun's assessment (allocated to Marcus Lin) — candidate can log in and start");
  }

  // ---- Priya: complete her assessment end-to-end -------------------------
  const existingPriya = (await store.list<any>("assessments")).find(
    (a) => a.candidateId === priyaCandidate?.id,
  );
  if (!existingPriya && priyaCandidate && kavitha) {
    const assessment = await svc.createAssessment({
      candidateId: priyaCandidate.id,
      roleCode: "RSA",
      blueprintCode: "RSA-STD-V1",
      assessorId: kavitha.id,
    });
    console.log(`· created ${assessment.code} for Priya (allocated to Kavitha Rao)`);

    const priyaUser = await svc.findUserByEmail("priya.nair@example.io");
    // 11/12 correct (misses Q-RSA-008, exactly-once streaming)
    const correct: Record<string, string> = {
      "Q-RSA-001": "b", "Q-RSA-002": "b", "Q-RSA-003": "b", "Q-RSA-004": "b",
      "Q-RSA-005": "b", "Q-RSA-006": "a", "Q-RSA-007": "b", "Q-RSA-008": "a",
      "Q-RSA-009": "a", "Q-RSA-010": "c", "Q-RSA-011": "b", "Q-RSA-012": "b",
    };
    await svc.submitOnlineAnswers(
      priyaUser!,
      assessment.id,
      Object.entries(correct).map(([questionCode, sel]) => ({ questionCode, selected: [sel] })),
    );
    console.log("· Priya submitted the knowledge check (11/12 correct)");

    await svc.submitAssessorScores(kavitha, assessment.id, [
      { questionCode: "Q-RSA-101", criterionScores: { QUALITY: 70 }, evidence: "Solid medallion + SCD2 via apply-changes; rejected full recompute with reasons." },
      { questionCode: "Q-RSA-102", criterionScores: { QUALITY: 70 }, evidence: "UCX/SYNC-aware phased plan; grants and rollback covered." },
      { questionCode: "Q-RSA-103", criterionScores: { QUALITY: 40 }, evidence: "Watermark mentioned but state growth and idempotent sink detail thin." },
      { questionCode: "Q-RSA-201", criterionScores: { REQ: 100, ARCH: 100, GOV: 70, MIG: 70, COMMS: 100 }, evidence: "Strong exec-ready migration story; regional row-level governance handled; realistic dual-run reconciliation." },
      { questionCode: "Q-RSA-202", criterionScores: { STREAM: 40, SCALE: 40, COST: 70, OPS: 70 }, evidence: "Late-data handling under-specified; cost and ops sections competent." },
    ]);
    console.log("· Kavitha submitted rubric scores — engine computed results + gap map");
  }

  const total = await store.countAll();
  console.log(`\n✔ seed complete — ${total} records in ${store.kind} store.`);
  console.log("  demo logins: admin@ecod.io / admin123! · kavitha.rao@ecod.io / assess123! · arjun.mehta@example.io / cand123!");
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
