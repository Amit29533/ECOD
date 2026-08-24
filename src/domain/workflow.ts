/**
 * Workflow state machines for the ECOD journey:
 *
 *   Candidate:  intake -> role_mapped -> in_assessment -> assessed
 *               -> gap_mapped -> [enrichment...] -> validation -> enterprise_ready
 *   Assessment: allocated -> online_* -> assessor_scoring -> scored -> gap_mapped
 *
 * Transitions are enforced centrally so every entry point (UI, API, scripts)
 * produces a legal, auditable journey.
 */

import type { AssessmentStatus, CandidateStatus } from "./types";

export const CANDIDATE_JOURNEY: CandidateStatus[] = [
  "intake",
  "role_mapped",
  "in_assessment",
  "assessed",
  "gap_mapped",
  "enrichment_planned",
  "enriching",
  "validation",
  "enterprise_ready",
];

const CANDIDATE_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  intake: ["role_mapped", "on_hold", "rejected"],
  role_mapped: ["in_assessment", "on_hold", "rejected"],
  in_assessment: ["assessed", "gap_mapped", "on_hold"],
  assessed: ["gap_mapped", "on_hold"],
  gap_mapped: ["enrichment_planned", "in_assessment", "validation", "on_hold"],
  enrichment_planned: ["enriching", "on_hold"],
  enriching: ["validation", "in_assessment", "on_hold"],
  validation: ["enterprise_ready", "gap_mapped", "on_hold"],
  enterprise_ready: ["on_hold"],
  on_hold: ["intake", "role_mapped", "in_assessment", "rejected"],
  rejected: [],
};

const ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  allocated: ["online_in_progress", "online_complete", "assessor_scoring"],
  online_in_progress: ["online_complete"],
  online_complete: ["assessor_scoring"],
  assessor_scoring: ["scored"],
  scored: ["gap_mapped"],
  gap_mapped: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    kind: "candidate" | "assessment",
  ) {
    super(`Illegal ${kind} transition: ${from} -> ${to}`);
  }
}

export function candidateTransitionAllowed(from: CandidateStatus, to: CandidateStatus): boolean {
  // Forward-jumps within the journey are allowed (assessment may complete fast),
  // sideways states (on_hold/rejected) follow the explicit graph.
  if (from === to) return true;
  if ((CANDIDATE_TRANSITIONS[from] ?? []).includes(to)) return true;
  // allow forward progression skipping intermediate journey steps
  const fi = CANDIDATE_JOURNEY.indexOf(from);
  const ti = CANDIDATE_JOURNEY.indexOf(to);
  return fi !== -1 && ti !== -1 && ti > fi;
}

export function assessmentTransitionAllowed(from: AssessmentStatus, to: AssessmentStatus): boolean {
  if (from === to) return true;
  return (ASSESSMENT_TRANSITIONS[from] ?? []).includes(to);
}

export function assertCandidateTransition(from: CandidateStatus, to: CandidateStatus): void {
  if (!candidateTransitionAllowed(from, to)) throw new InvalidTransitionError(from, to, "candidate");
}

export function assertAssessmentTransition(from: AssessmentStatus, to: AssessmentStatus): void {
  if (!assessmentTransitionAllowed(from, to)) throw new InvalidTransitionError(from, to, "assessment");
}

/** Candidate status implied by an assessment lifecycle event. */
export function candidateStatusForAssessment(status: AssessmentStatus): CandidateStatus {
  switch (status) {
    case "allocated":
    case "online_in_progress":
    case "online_complete":
    case "assessor_scoring":
      return "in_assessment";
    case "scored":
      return "assessed";
    case "gap_mapped":
      return "gap_mapped";
  }
}

export const ASSESSMENT_STEPS: { status: AssessmentStatus; label: string }[] = [
  { status: "allocated", label: "Allocated" },
  { status: "online_in_progress", label: "Online started" },
  { status: "online_complete", label: "Online complete" },
  { status: "assessor_scoring", label: "Assessor scoring" },
  { status: "scored", label: "Scored" },
  { status: "gap_mapped", label: "Gap mapped" },
];

export const CANDIDATE_JOURNEY_LABELS: Record<CandidateStatus, string> = {
  intake: "Intake",
  role_mapped: "Role mapped",
  in_assessment: "In assessment",
  assessed: "Assessed",
  gap_mapped: "Gap mapped",
  enrichment_planned: "Enrichment planned",
  enriching: "Enriching",
  validation: "Validation",
  enterprise_ready: "Enterprise ready",
  on_hold: "On hold",
  rejected: "Rejected",
};
