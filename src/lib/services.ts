/**
 * ECOD service layer.
 *
 * The ONE place where business workflows touch persistence. UI pages and API
 * routes both call these functions - so the rules (compartmentalisation,
 * workflow transitions, scoring) can never drift between entry points.
 * Scripts (seed, e2e) use them too, which is why they accept an explicit
 * actor instead of reading the request context.
 */

import type {
  Assessment,
  AssessmentBlueprint,
  AssessorItemScore,
  Candidate,
  Competency,
  ContentCollection,
  EnrichmentItem,
  OnlineAnswer,
  Question,
  RoleTrack,
  User,
} from "@/domain/types";
import { getAdapter } from "@/data/adapter";
import {
  assertAssessmentTransition,
  assertCandidateTransition,
  candidateStatusForAssessment,
} from "@/domain/workflow";
import { canViewAssessment, sanitizeCandidate } from "@/domain/rbac";
import {
  assessorScoringComplete,
  computeResults,
  scoreOnlineAnswer,
  scoreRubricItem,
} from "@/domain/scoring";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { newId } from "./ids";
import { hashPassword } from "./auth";
import { readContentFile, writeContentFile } from "@/data/content-io";

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap / content sync                                             */
/* ------------------------------------------------------------------ */

export async function ensureSeeded(): Promise<void> {
  const store = getAdapter();
  if ((await store.countAll()) > 0) return;
  await syncContentFromFiles();
  await seedUsers();
}

export async function syncContentFromFiles(): Promise<void> {
  const store = getAdapter();
  const collections: ContentCollection[] = ["roles", "competencies", "questions", "blueprints", "enrichment"];
  for (const c of collections) {
    const records = readContentFile<any>(c);
    if (records.length) await store.replaceAll(c, records);
  }
}

interface UserSpec {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  title?: string;
  password: string;
  active: boolean;
}

function readUserSpecs(): UserSpec[] {
  const path = resolve(process.cwd(), "content/users.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as UserSpec[];
}

/** Users come from content/users.json with passwords hashed into the store. */
export async function seedUsers(force = false): Promise<void> {
  const store = getAdapter();
  for (const spec of readUserSpecs()) {
    if (!force) {
      const existing = await store.findOne<User>("users", "email", spec.email);
      if (existing) continue;
    }
    await store.put<User>("users", {
      id: spec.id,
      name: spec.name,
      email: spec.email.toLowerCase(),
      role: spec.role,
      title: spec.title,
      passwordHash: hashPassword(spec.password),
      active: spec.active ?? true,
      createdAt: new Date().toISOString(),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Users                                                                */
/* ------------------------------------------------------------------ */

export async function listUsers(): Promise<User[]> {
  return getAdapter().list<User>("users");
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return getAdapter().findOne<User>("users", "email", email.toLowerCase());
}

export async function createUser(input: {
  name: string;
  email: string;
  role: User["role"];
  title?: string;
  password: string;
}): Promise<User> {
  const store = getAdapter();
  if (await store.findOne<User>("users", "email", input.email.toLowerCase())) {
    throw new ServiceError("A user with that email already exists.");
  }
  const user: User = {
    id: newId("u"),
    name: input.name,
    email: input.email.toLowerCase(),
    role: input.role,
    title: input.title,
    passwordHash: hashPassword(input.password),
    active: true,
    createdAt: new Date().toISOString(),
  };
  return store.put("users", user);
}

/* ------------------------------------------------------------------ */
/* Candidates                                                           */
/* ------------------------------------------------------------------ */

export async function listCandidates(actor: User): Promise<Candidate[]> {
  if (actor.role !== "admin") throw new ServiceError("Candidate pool access is restricted to administrators.", 403);
  return getAdapter().list<Candidate>("candidates");
}

export async function getCandidateById(candidateId: string): Promise<Candidate | null> {
  return getAdapter().get<Candidate>("candidates", candidateId);
}

export async function getCandidateForUser(user: User): Promise<Candidate | null> {
  return getAdapter().findOne<Candidate>("candidates", "email", user.email);
}

export async function createCandidate(input: {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  timezone?: string;
  currentRole?: string;
  yearsExperience?: number;
  linkedinUrl?: string;
  cvSummary?: string;
  skills?: string[];
  technologies?: string[];
  source?: string;
  intakeNotes?: string;
  internal?: Candidate["internal"];
}): Promise<Candidate> {
  const store = getAdapter();
  if (await store.findOne<Candidate>("candidates", "email", input.email.toLowerCase())) {
    throw new ServiceError("A candidate with that email already exists.");
  }
  const count = (await store.list<Candidate>("candidates")).length;
  const now = new Date().toISOString();
  const candidate: Candidate = {
    id: newId("cand"),
    code: `CAND-${1001 + count}`,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    location: input.location,
    timezone: input.timezone,
    currentRole: input.currentRole,
    yearsExperience: input.yearsExperience,
    linkedinUrl: input.linkedinUrl,
    cvSummary: input.cvSummary,
    skills: input.skills ?? [],
    technologies: input.technologies ?? [],
    source: input.source,
    intakeNotes: input.intakeNotes,
    status: "intake",
    createdAt: now,
    updatedAt: now,
  };
  if (input.internal) candidate.internal = input.internal;
  return store.put("candidates", candidate);
}

export async function updateCandidateStatus(candidate: Candidate, to: Candidate["status"]): Promise<Candidate> {
  assertCandidateTransition(candidate.status, to);
  const next = { ...candidate, status: to, updatedAt: new Date().toISOString() };
  return getAdapter().put("candidates", next);
}

/* ------------------------------------------------------------------ */
/* Content (roles, competencies, questions, blueprints, enrichment)     */
/* ------------------------------------------------------------------ */

export async function getContent(collection: ContentCollection) {
  const store = getAdapter();
  const empty = await store.list<any>(collection as any);
  return empty;
}

export async function getRoleByCode(code: string): Promise<RoleTrack | null> {
  return getAdapter().findOne<RoleTrack>("roles", "code", code);
}

export async function listCompetencies(roleCode?: string): Promise<Competency[]> {
  return getAdapter().list<Competency>("competencies", {
    filter: roleCode ? (c) => c.roleCode === roleCode : undefined,
  });
}

export async function listBlueprints(roleCode?: string): Promise<AssessmentBlueprint[]> {
  return getAdapter().list<AssessmentBlueprint>("blueprints", {
    filter: roleCode ? (b) => b.roleCode === roleCode && b.active : undefined,
  });
}

export async function getBlueprintByCode(code: string): Promise<AssessmentBlueprint | null> {
  return getAdapter().findOne<AssessmentBlueprint>("blueprints", "code", code);
}

export async function listQuestions(roleCode?: string): Promise<Question[]> {
  return getAdapter().list<Question>("questions", {
    filter: roleCode ? (q) => q.roleCode === roleCode : undefined,
  });
}

export async function listEnrichment(roleCode?: string): Promise<EnrichmentItem[]> {
  return getAdapter().list<EnrichmentItem>("enrichment", {
    filter: roleCode ? (e) => e.roleCode === roleCode : undefined,
  });
}

/** Admin content editor save: validate shape, persist, and (json mode) write files. */
export async function saveContent(collection: ContentCollection, records: any[]): Promise<void> {
  if (!Array.isArray(records) || records.some((r) => !r?.id)) {
    throw new ServiceError("Content must be a JSON array of records each having an `id`.");
  }
  const store = getAdapter();
  await store.replaceAll(collection, records);
  if (store.kind === "json") writeContentFile(collection, records);
}

/* ------------------------------------------------------------------ */
/* Assessments                                                          */
/* ------------------------------------------------------------------ */

export interface AssessmentView {
  assessment: Assessment;
  candidate: Candidate; // sanitized for the viewer
  viewerIsOwnerCandidate: boolean;
  role: RoleTrack | null;
  blueprint: AssessmentBlueprint | null;
  questions: Question[];
}

export async function listAssessmentsFor(actor: User): Promise<Assessment[]> {
  const store = getAdapter();
  if (actor.role === "admin") return store.list<Assessment>("assessments");
  if (actor.role === "assessor") return store.list<Assessment>("assessments", { filter: (a) => a.assessorId === actor.id });
  const candidate = await getCandidateForUser(actor);
  if (!candidate) return [];
  return store.list<Assessment>("assessments", { filter: (a) => a.candidateId === candidate.id });
}

export async function getAssessmentView(actor: User, assessmentId: string): Promise<AssessmentView | null> {
  const store = getAdapter();
  const assessment = await store.get<Assessment>("assessments", assessmentId);
  if (!assessment) return null;
  const candidate = await getCandidateById(assessment.candidateId);
  if (!canViewAssessment(actor, assessment, candidate?.email)) throw new ServiceError("Not authorised for this assessment.", 403);
  const [role, blueprint, questions] = await Promise.all([
    getRoleByCode(assessment.roleCode),
    getBlueprintByCode(assessment.blueprintCode),
    listQuestions(assessment.roleCode),
  ]);
  return {
    assessment,
    candidate: sanitizeCandidate(candidate, actor.role)!,
    viewerIsOwnerCandidate: actor.role === "candidate" && candidate?.email === actor.email,
    role,
    blueprint,
    questions,
  };
}

export async function createAssessment(input: {
  candidateId: string;
  roleCode: string;
  blueprintCode: string;
  assessorId: string;
}): Promise<Assessment> {
  const store = getAdapter();
  const candidate = await getCandidateById(input.candidateId);
  if (!candidate) throw new ServiceError("Candidate not found.", 404);
  const role = await getRoleByCode(input.roleCode);
  if (!role || !role.active) throw new ServiceError("Role track not found or inactive.", 404);
  const blueprint = await getBlueprintByCode(input.blueprintCode);
  if (!blueprint || !blueprint.active || blueprint.roleCode !== input.roleCode) {
    throw new ServiceError("Blueprint not found for this role.", 404);
  }
  const assessor = await store.get<User>("users", input.assessorId);
  if (!assessor || assessor.role !== "assessor" || !assessor.active) {
    throw new ServiceError("Allocated user is not an active assessor.", 400);
  }
  const count = (await store.list<Assessment>("assessments")).length;
  const now = new Date().toISOString();
  const assessment: Assessment = {
    id: newId("asmt"),
    code: `ASMT-${2001 + count}`,
    candidateId: candidate.id,
    roleCode: input.roleCode,
    blueprintCode: input.blueprintCode,
    status: "allocated",
    assessorId: assessor.id,
    allocatedAt: now,
    onlineAnswers: [],
    assessorScores: [],
    createdAt: now,
    updatedAt: now,
  };
  await store.put("assessments", assessment);
  await updateCandidateStatus(candidate, "in_assessment");
  return assessment;
}

/** Candidate submits the online section. Answers are auto-scored immediately. */
export async function submitOnlineAnswers(
  actor: User,
  assessmentId: string,
  answers: { questionCode: string; selected: string[]; text?: string }[],
): Promise<Assessment> {
  const store = getAdapter();
  const assessment = await store.get<Assessment>("assessments", assessmentId);
  if (!assessment) throw new ServiceError("Assessment not found.", 404);
  if (actor.role !== "candidate") throw new ServiceError("Only candidates submit the online section.", 403);
  const candidate = await getCandidateById(assessment.candidateId);
  if (!candidate || candidate.email !== actor.email) throw new ServiceError("This is not your assessment.", 403);
  if (["scored", "gap_mapped"].includes(assessment.status)) throw new ServiceError("Assessment already scored.", 409);

  const blueprint = await getBlueprintByCode(assessment.blueprintCode);
  if (!blueprint) throw new ServiceError("Blueprint missing.", 500);
  const questions = await listQuestions(assessment.roleCode);
  const byCode = new Map(questions.map((q) => [q.code, q]));
  const onlineSection = blueprint.sections.find((s) => s.delivery === "online");
  const validCodes = new Set(onlineSection?.questionCodes ?? []);

  const now = new Date().toISOString();
  const scored: OnlineAnswer[] = [];
  for (const code of validCodes) {
    const q = byCode.get(code);
    const submitted = answers.find((a) => a.questionCode === code);
    if (!q || !submitted) continue;
    const { score, correct } = scoreOnlineAnswer(q, submitted.selected ?? []);
    scored.push({
      questionCode: code,
      selected: submitted.selected ?? [],
      text: submitted.text,
      autoScore: score,
      correct,
      submittedAt: now,
    });
  }
  const allAnswered = scored.length === validCodes.size;

  const nextStatus: Assessment["status"] = allAnswered ? "online_complete" : "online_in_progress";
  assertAssessmentTransition(assessment.status, nextStatus);
  const updated: Assessment = {
    ...assessment,
    onlineAnswers: scored,
    status: nextStatus,
    onlineStartedAt: assessment.onlineStartedAt ?? now,
    onlineCompletedAt: allAnswered ? now : undefined,
    updatedAt: now,
  };
  // allow candidate to resubmit only while online stage is not complete
  if (assessment.status === "online_in_progress" || assessment.status === "allocated") {
    updated.onlineCompletedAt = allAnswered ? now : undefined;
  }
  return store.put("assessments", updated);
}

/** Assessor submits rubric scores; engine computes results + gaps atomically. */
export async function submitAssessorScores(
  actor: User,
  assessmentId: string,
  scores: { questionCode: string; criterionScores: Record<string, number>; evidence?: string; notes?: string }[],
): Promise<Assessment> {
  const store = getAdapter();
  const assessment = await store.get<Assessment>("assessments", assessmentId);
  if (!assessment) throw new ServiceError("Assessment not found.", 404);
  if (actor.role !== "assessor" || assessment.assessorId !== actor.id) {
    throw new ServiceError("Only the allocated assessor may score this assessment.", 403);
  }
  if (!["online_complete", "assessor_scoring"].includes(assessment.status)) {
    throw new ServiceError(`Scoring not allowed while status is ${assessment.status}.`, 409);
  }

  const [blueprint, questions, role, competencies, enrichment] = await Promise.all([
    getBlueprintByCode(assessment.blueprintCode),
    listQuestions(assessment.roleCode),
    getRoleByCode(assessment.roleCode),
    listCompetencies(assessment.roleCode),
    listEnrichment(assessment.roleCode),
  ]);
  if (!blueprint || !role) throw new ServiceError("Assessment configuration missing.", 500);
  const byCode = new Map(questions.map((q) => [q.code, q]));

  const now = new Date().toISOString();
  const assessorScores: AssessorItemScore[] = scores.map((s) => {
    const q = byCode.get(s.questionCode);
    if (!q) throw new ServiceError(`Unknown question ${s.questionCode}.`, 400);
    const criterionScores: Record<string, number> = {};
    for (const c of q.rubric ?? []) {
      const v = s.criterionScores[c.code];
      if (v !== undefined) criterionScores[c.code] = v;
    }
    return {
      questionCode: s.questionCode,
      criterionScores,
      itemScore: scoreRubricItem(q, criterionScores),
      evidence: s.evidence,
      notes: s.notes,
      scoredBy: actor.id,
      scoredAt: now,
    };
  });

  const { complete, missing } = assessorScoringComplete(blueprint, byCode, assessorScores);
  if (!complete) throw new ServiceError(`Incomplete scoring for: ${missing.join(", ")}.`, 400);

  const results = computeResults({
    role,
    competencies,
    blueprint,
    questions,
    onlineAnswers: assessment.onlineAnswers,
    assessorScores,
    enrichment,
  });

  const updated: Assessment = {
    ...assessment,
    status: "gap_mapped", // scoring + gap generation happen together
    assessorScores,
    results,
    updatedAt: now,
  };
  assertAssessmentTransition(assessment.status, "assessor_scoring");
  const stored = await store.put("assessments", updated);

  const candidate = await getCandidateById(assessment.candidateId);
  if (candidate) await updateCandidateStatus(candidate, candidateStatusForAssessment("gap_mapped"));
  return stored;
}

/** Admin: re-run the scoring engine (idempotent) - e.g. after a rubric edit. */
export async function recomputeAssessment(assessmentId: string): Promise<Assessment> {
  const store = getAdapter();
  const assessment = await store.get<Assessment>("assessments", assessmentId);
  if (!assessment) throw new ServiceError("Assessment not found.", 404);
  if (!assessment.assessorScores.length && !assessment.onlineAnswers.length) {
    throw new ServiceError("Nothing to score yet.", 409);
  }
  const [blueprint, questions, role, competencies, enrichment] = await Promise.all([
    getBlueprintByCode(assessment.blueprintCode),
    listQuestions(assessment.roleCode),
    getRoleByCode(assessment.roleCode),
    listCompetencies(assessment.roleCode),
    listEnrichment(assessment.roleCode),
  ]);
  if (!blueprint || !role) throw new ServiceError("Assessment configuration missing.", 500);
  const results = computeResults({
    role,
    competencies,
    blueprint,
    questions,
    onlineAnswers: assessment.onlineAnswers,
    assessorScores: assessment.assessorScores,
    enrichment,
  });
  return store.put("assessments", { ...assessment, results, updatedAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

export async function dashboardStats() {
  const store = getAdapter();
  const [candidates, assessments] = await Promise.all([
    store.list<Candidate>("candidates"),
    store.list<Assessment>("assessments"),
  ]);
  const byStatus = (statuses: string[]) =>
    Object.fromEntries(statuses.map((s) => [s, candidates.filter((c) => c.status === s).length]));
  const scored = assessments.filter((a) => a.results);
  const readiness = scored.length
    ? Math.round(scored.reduce((s, a) => s + (a.results?.readinessScore ?? 0), 0) / scored.length)
    : null;
  return {
    totalCandidates: candidates.length,
    candidateStatus: byStatus([
      "intake",
      "role_mapped",
      "in_assessment",
      "assessed",
      "gap_mapped",
      "enrichment_planned",
      "enriching",
      "validation",
      "enterprise_ready",
      "on_hold",
    ]),
    totalAssessments: assessments.length,
    assessmentStatus: Object.fromEntries(
      ["allocated", "online_in_progress", "online_complete", "assessor_scoring", "scored", "gap_mapped"].map((s) => [
        s,
        assessments.filter((a) => a.status === s).length,
      ]),
    ),
    avgReadiness: readiness,
    openGaps: scored.reduce((n, a) => n + (a.results?.gaps.length ?? 0), 0),
  };
}
