/**
 * ECOD domain types.
 *
 * This module is the contract between the business logic (src/domain) and
 * everything else (UI, API, persistence). It deliberately has ZERO imports -
 * the domain layer must stay portable across Next.js, scripts and any future
 * service that hosts the business logic, so the platform can outlive the
 * current MVP stack.
 */

/* ------------------------------------------------------------------ */
/* Identity & access                                                    */
/* ------------------------------------------------------------------ */

/** Platform roles. Phase 2 adds 'trainer' and 'validator'. */
export type UserRole = "admin" | "assessor" | "candidate";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title?: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  /** Revocation watermark (epoch ms): session tokens issued before this are invalid. */
  sessionsValidAfter?: number;
}

/* ------------------------------------------------------------------ */
/* Candidate pool                                                       */
/* ------------------------------------------------------------------ */

export type CandidateStatus =
  | "intake" // captured, not yet mapped to a role track
  | "role_mapped" // mapped to a track, assessment not yet created
  | "in_assessment" // at least one assessment in flight
  | "assessed" // assessment scored, gaps not yet generated
  | "gap_mapped" // assessment complete + capability gaps generated
  | "enrichment_planned" // phase 2
  | "enriching" // phase 2
  | "validation" // phase 2
  | "enterprise_ready"
  | "on_hold"
  | "rejected";

export interface Candidate {
  id: string;
  code: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  timezone?: string;
  currentRole?: string;
  yearsExperience?: number;
  linkedinUrl?: string;
  cvSummary?: string;
  skills: string[];
  technologies: string[];
  source?: string;
  intakeNotes?: string;
  status: CandidateStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * Admin-only compartment: commercials, client allocation, ratings.
   * NEVER serialised to assessors, trainers, validators or candidates.
   */
  internal?: {
    commercialTerms?: string;
    clientNotes?: string;
    rating?: string;
  };
}

/* ------------------------------------------------------------------ */
/* Configurable domain content (loaded from /content or Airtable)       */
/* ------------------------------------------------------------------ */

export interface RoleTrack {
  id: string;
  code: string;
  title: string;
  technology: string;
  description: string;
  /** Overall readiness score (0-100) required for the track. */
  passMark: number;
  active: boolean;
}

export interface Competency {
  id: string;
  roleCode: string;
  code: string;
  name: string;
  group: string;
  description: string;
  /** Relative weight inside the role (weights should total ~100). */
  weight: number;
  /** Required score (0-100) for this competency to be considered met. */
  threshold: number;
  order: number;
}

export type QuestionType = "mcq" | "multi-select" | "short-answer" | "case-study";
export type DeliveryMode = "online" | "assessor";

export interface QuestionOption {
  id: string;
  text: string;
}

export interface RubricLevel {
  /** Score awarded for this level (0-100). */
  score: number;
  label: string;
  descriptor: string;
}

export interface RubricCriterion {
  code: string;
  label: string;
  /** Optional: maps this criterion's score to a single competency. */
  competencyCode?: string;
  weight?: number;
  levels: RubricLevel[];
}

export interface Question {
  id: string;
  code: string;
  type: QuestionType;
  roleCode: string;
  delivery: DeliveryMode;
  prompt: string;
  context?: string;
  /** Answer choices for mcq / multi-select. */
  options?: QuestionOption[];
  /** Correct option id(s) for auto-scoring, or a model answer guide for assessors. */
  expectedAnswer?: string;
  /** Rationale shown in reports after scoring. */
  explanation?: string;
  /** What a strong answer contains - shown to assessors. */
  expectedEvidence?: string;
  /** Scoring rubric for assessor-delivered items. */
  rubric?: RubricCriterion[];
  competencyCodes: string[];
  /** Base weight of this item within competency aggregation. */
  weight: number;
  difficulty: "foundation" | "intermediate" | "advanced";
  tags: string[];
}

export interface BlueprintSection {
  id: string;
  name: string;
  delivery: DeliveryMode;
  instructions: string;
  questionCodes: string[];
  /** Section weight scales the contribution of its items. */
  weight: number;
}

export interface AssessmentBlueprint {
  id: string;
  code: string;
  roleCode: string;
  name: string;
  version: string;
  passMark?: number;
  sections: BlueprintSection[];
  active: boolean;
}

export interface EnrichmentItem {
  id: string;
  roleCode: string;
  competencyCode: string;
  title: string;
  type: "course" | "lab" | "reading" | "project" | "mentorship";
  provider?: string;
  durationHrs?: number;
  url?: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/* Runtime assessment records                                           */
/* ------------------------------------------------------------------ */

export type AssessmentStatus =
  | "allocated" // created + assessor allocated, candidate has not started
  | "online_in_progress"
  | "online_complete" // online section submitted (or none exists)
  | "assessor_scoring" // assessor is working through rubric items
  | "scored" // all items scored, results computed
  | "gap_mapped"; // gaps + enrichment recommendations generated

export interface OnlineAnswer {
  questionCode: string;
  selected: string[];
  text?: string;
  autoScore?: number;
  correct?: boolean;
  submittedAt?: string;
}

export interface AssessorItemScore {
  questionCode: string;
  /** criterionCode -> chosen level score (0-100). */
  criterionScores: Record<string, number>;
  itemScore?: number;
  /** Evidence justifying the score - mandatory for case studies. */
  evidence?: string;
  notes?: string;
  scoredBy?: string;
  scoredAt?: string;
}

export type GapSeverity = "minor" | "major" | "critical";
export type CompetencyStatus = "meets" | "gap_minor" | "gap_major" | "gap_critical" | "not_assessed";

export interface CompetencyResult {
  competencyCode: string;
  name: string;
  score: number;
  threshold: number;
  weight: number;
  status: CompetencyStatus;
  gap: number; // 0 when meeting, otherwise threshold - score
}

export interface GapRecommendation {
  enrichmentId: string;
  title: string;
  type: string;
  durationHrs?: number;
}

export interface GapRecord {
  competencyCode: string;
  name: string;
  score: number;
  threshold: number;
  gap: number;
  severity: GapSeverity;
  recommendations: GapRecommendation[];
}

export type AssessmentOutcome = "ready_pending_validation" | "enrichment_required" | "not_ready";

export interface AssessmentResults {
  readinessScore: number;
  passMark: number;
  outcome: AssessmentOutcome;
  competencyResults: CompetencyResult[];
  gaps: GapRecord[];
  strengths: string[];
  developmentAreas: string[];
  summary: string;
  scoredAt?: string;
}

export interface Assessment {
  id: string;
  code: string;
  candidateId: string;
  roleCode: string;
  blueprintCode: string;
  status: AssessmentStatus;
  assessorId?: string;
  allocatedAt?: string;
  onlineStartedAt?: string;
  onlineCompletedAt?: string;
  onlineAnswers: OnlineAnswer[];
  assessorScores: AssessorItemScore[];
  results?: AssessmentResults;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Content collections (what the admin content editor manages)          */
/* ------------------------------------------------------------------ */

export type ContentCollection = "roles" | "competencies" | "questions" | "blueprints" | "enrichment";
