/**
 * Unit tests: workflow state machines, RBAC/compartmentalisation, auth crypto.
 */
process.env.SESSION_SECRET = "unit-test-secret";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessmentTransitionAllowed,
  candidateStatusForAssessment,
  candidateTransitionAllowed,
} from "../src/domain/workflow";
import { can, canViewAssessment, roleHome, sanitizeCandidate } from "../src/domain/rbac";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "../src/lib/auth";
import type { Assessment, Candidate, User } from "../src/domain/types";

/* ------------------------------ workflow ---------------------------- */

test("candidate workflow: forward jumps allowed, sideways only via graph", () => {
  assert.ok(candidateTransitionAllowed("intake", "role_mapped"));
  assert.ok(candidateTransitionAllowed("intake", "gap_mapped")); // fast-forward
  assert.ok(candidateTransitionAllowed("in_assessment", "on_hold"));
  assert.ok(candidateTransitionAllowed("on_hold", "role_mapped"));
  assert.ok(candidateTransitionAllowed("enterprise_ready", "on_hold"));
  assert.equal(candidateTransitionAllowed("enterprise_ready", "intake"), false); // no going back
  assert.equal(candidateTransitionAllowed("rejected", "intake"), false); // terminal
  assert.equal(candidateTransitionAllowed("gap_mapped", "in_assessment"), true); // re-assessment loop
  assert.equal(candidateTransitionAllowed("enriching", "enterprise_ready"), false); // must validate first
  assert.equal(candidateTransitionAllowed("scored_placeholder" as any, "intake"), false);
});

test("assessment workflow: legal and illegal transitions", () => {
  assert.ok(assessmentTransitionAllowed("allocated", "online_in_progress"));
  assert.ok(assessmentTransitionAllowed("allocated", "assessor_scoring")); // no-online blueprints
  assert.equal(assessmentTransitionAllowed("allocated", "scored"), false);
  assert.ok(assessmentTransitionAllowed("online_in_progress", "online_complete"));
  assert.equal(assessmentTransitionAllowed("online_in_progress", "assessor_scoring"), false);
  assert.ok(assessmentTransitionAllowed("online_complete", "assessor_scoring"));
  assert.ok(assessmentTransitionAllowed("scored", "gap_mapped"));
  assert.equal(assessmentTransitionAllowed("gap_mapped", "assessor_scoring"), false);
  assert.equal(assessmentTransitionAllowed("gap_mapped", "allocated"), false);
});

test("candidate status mirrors assessment lifecycle", () => {
  assert.equal(candidateStatusForAssessment("allocated"), "in_assessment");
  assert.equal(candidateStatusForAssessment("assessor_scoring"), "in_assessment");
  assert.equal(candidateStatusForAssessment("scored"), "assessed");
  assert.equal(candidateStatusForAssessment("gap_mapped"), "gap_mapped");
});

/* -------------------------------- RBAC ------------------------------ */

const admin: User = { id: "u-a", name: "A", email: "a@x.io", role: "admin", passwordHash: "", active: true, createdAt: "" };
const assessor: User = { id: "u-s", name: "S", email: "s@x.io", role: "assessor", passwordHash: "", active: true, createdAt: "" };
const candidateUser: User = { id: "u-c", name: "C", email: "c@x.io", role: "candidate", passwordHash: "", active: true, createdAt: "" };
const assessment: Assessment = {
  id: "as", code: "X", candidateId: "cand-1", roleCode: "RSA", blueprintCode: "BP",
  status: "allocated", assessorId: "u-s", onlineAnswers: [], assessorScores: [],
  createdAt: "", updatedAt: "",
};
const candidate: Candidate = {
  id: "cand-1", code: "C1", name: "Cand", email: "c@x.io", skills: [], technologies: [],
  status: "intake", createdAt: "", updatedAt: "",
  internal: { commercialTerms: "30% margin", clientNotes: "Acme", rating: "A" },
};

test("permission matrix: assessors and candidates never touch pool/content/users", () => {
  assert.ok(can(admin, "candidate.create") && can(admin, "content.edit") && can(admin, "users.manage"));
  assert.equal(can(assessor, "candidate.view"), false);
  assert.equal(can(assessor, "candidate.create"), false);
  assert.equal(can(assessor, "content.view"), false);
  assert.equal(can(assessor, "users.manage"), false);
  assert.ok(can(assessor, "assessment.view") && can(assessor, "assessment.score"));
  assert.equal(can(assessor, "assessment.submitOnline"), false);
  assert.ok(can(candidateUser, "assessment.submitOnline"));
  assert.equal(can(candidateUser, "assessment.score"), false);
  assert.equal(can(candidateUser, "dashboard.view"), false);
});

test("assessment visibility is allocation-scoped", () => {
  assert.ok(canViewAssessment(admin, assessment, "c@x.io"));
  assert.ok(canViewAssessment(assessor, assessment)); // allocated to u-s
  assert.equal(canViewAssessment({ ...assessor, id: "u-other" }, assessment), false);
  assert.ok(canViewAssessment(candidateUser, assessment, "c@x.io"));
  assert.equal(canViewAssessment(candidateUser, assessment, "someone-else@x.io"), false);
});

test("sanitizeCandidate strips the internal compartment for non-admins, keeps everything else", () => {
  const forAssessor = sanitizeCandidate(candidate, "assessor");
  assert.equal("internal" in forAssessor, false);
  assert.equal(forAssessor.name, "Cand");
  assert.equal(forAssessor.status, "intake");
  const forAdmin = sanitizeCandidate(candidate, "admin");
  assert.deepEqual(forAdmin.internal, candidate.internal);
  const forCandidate = sanitizeCandidate(candidate, "candidate");
  assert.equal("internal" in forCandidate, false);
});

test("role homes", () => {
  assert.equal(roleHome(admin), "/admin");
  assert.equal(roleHome(assessor), "/assessor");
  assert.equal(roleHome(candidateUser), "/candidate");
});

/* -------------------------------- auth ------------------------------ */

test("password hashing: scrypt, salted, verifiable, rejects wrong/malformed", () => {
  const hash = hashPassword("s3cret-pass");
  assert.notEqual(hash, "s3cret-pass");
  assert.ok(hash.includes(":"));
  assert.equal(verifyPassword("s3cret-pass", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
  assert.equal(verifyPassword("s3cret-pass", "garbage"), false);
  assert.equal(verifyPassword("s3cret-pass", ""), false);
  assert.notEqual(hashPassword("s3cret-pass"), hash); // unique salts
});

test("session tokens: round-trip, tamper-proof, expiring", async () => {
  const token = createSessionToken("user-123");
  const verified = verifySessionToken(token);
  assert.equal(verified?.userId, "user-123");
  assert.ok(verified && verified.exp > Date.now());
  // tampered payload invalidates signature
  const [payload, sig] = token.split(".");
  assert.equal(verifySessionToken(`${payload.slice(0, -2)}xx.${sig}`), null);
  assert.equal(verifySessionToken(token.replace(sig, sig.slice(0, -2))), null);
  assert.equal(verifySessionToken("not-a-token"), null);
  assert.equal(verifySessionToken(undefined), null);
  // expired token rejected (created with clock shifted into the past)
  const realNow = Date.now;
  Date.now = () => realNow() - 8 * 24 * 60 * 60 * 1000;
  const expired = createSessionToken("user-123");
  Date.now = realNow;
  assert.equal(verifySessionToken(expired), null);
  // revocation watermark is enforced downstream (getCurrentUser compares iat vs sessionsValidAfter)
  const older = verifySessionToken(expired === null ? token : token);
  assert.ok(older!.iat <= Date.now());
});
