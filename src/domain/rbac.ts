/**
 * Role-based access control & compartmentalisation policy.
 *
 * ECOD principle: every participant sees only what their function requires.
 *  - admin      : full platform visibility incl. commercials/client notes.
 *  - assessor   : ONLY candidates allocated to them; professional profile +
 *                 assessment artefacts. Never candidate commercials, client
 *                 relationships, or the wider pool.
 *  - candidate  : only their own journey and results.
 * Phase 2 roles (trainer, validator) will follow the same pattern: scoped to
 * the candidates their function is allocated to.
 */

import type { Assessment, Candidate, User, UserRole } from "./types";

export type Action =
  | "candidate.view"
  | "candidate.viewInternal"
  | "candidate.create"
  | "candidate.edit"
  | "assessment.view"
  | "assessment.create"
  | "assessment.allocate"
  | "assessment.submitOnline"
  | "assessment.score"
  | "assessment.recompute"
  | "content.view"
  | "content.edit"
  | "users.manage"
  | "dashboard.view";

const MATRIX: Record<UserRole, Action[]> = {
  admin: [
    "candidate.view",
    "candidate.viewInternal",
    "candidate.create",
    "candidate.edit",
    "assessment.view",
    "assessment.create",
    "assessment.allocate",
    "assessment.recompute",
    "content.view",
    "content.edit",
    "users.manage",
    "dashboard.view",
  ],
  assessor: ["assessment.view", "assessment.score"],
  candidate: ["assessment.view", "assessment.submitOnline"],
};

export function can(user: Pick<User, "role">, action: Action): boolean {
  return MATRIX[user.role].includes(action);
}

/** Strip admin-only compartments depending on the viewer's role. */
export function sanitizeCandidate<T extends Candidate | null | undefined>(candidate: T, viewerRole: UserRole): T {
  if (!candidate) return candidate;
  if (viewerRole === "admin") return candidate;
  const { internal: _internal, ...rest } = candidate;
  return rest as T;
}

export function canViewAssessment(
  user: User,
  assessment: Assessment,
  candidateEmail?: string,
): boolean {
  switch (user.role) {
    case "admin":
      return true;
    case "assessor":
      return assessment.assessorId === user.id;
    case "candidate":
      return candidateEmail === user.email;
    default:
      return false;
  }
}

export function roleHome(user: Pick<User, "role">): string {
  switch (user.role) {
    case "admin":
      return "/admin";
    case "assessor":
      return "/assessor";
    case "candidate":
      return "/candidate";
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  assessor: "Assessor",
  candidate: "Candidate",
};
