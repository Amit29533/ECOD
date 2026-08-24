# Production Readiness Report

Status of the ECOD Assessment Module after the full test campaign
(covers the merged MVP plus the hardening that followed). This document is
the honest answer to "is it production ready?" — including what is verified,
what was found and fixed, and what is still known-limited.

## Verification summary

| Layer | Suite | Result |
| --- | --- | --- |
| Domain unit tests (scoring maths, gap severity/boundaries, workflow machine, RBAC matrix, auth crypto) | `npm test` | **38/38 pass** |
| Service integration (full workflow + every error path on a throwaway store) | `npm test` | included above |
| Black-box HTTP (production build, isolated server, hostile client) | `npm run test:api` | **76/76 pass** |
| Dependency audit (`npm audit --omit=dev`) | — | **0 vulnerabilities** (Next upgraded 15.3.3 → 16.3.2) |
| Strict TypeScript (`npm run typecheck`) | — | clean |
| Production build | `npm run build` | clean (18 routes) |
| Headless journey proof | `npm run demo:e2e` | pass |

### What the black-box suite attacks

- **Auth**: wrong/missing credentials, unknown user (no enumeration), malformed JSON, brute-force lockout (`429` per email+IP), tampered & forged session cookies, cookie flags (`HttpOnly`, `SameSite=Lax`, `Secure`), logout invalidating tokens **server-side**.
- **RBAC matrix**: every role (admin/assessor/candidate/anonymous) against every sensitive endpoint — pool, intake, users, content read/write, assessment creation — plus unsupported methods (`405`).
- **Cross-tenant**: candidate reading another candidate's assessment (`403`), non-allocated assessor reading/scoring (`403`), assessor view stripped of the internal compartment.
- **Workflow integrity**: partial vs complete online submission, resubmission after completion (`409` — answers frozen once submitted), double scoring (`409`), incomplete criteria / missing evidence (`400`), scoring before online completion (`409`), recompute guard before full scoring (`409`), exact engine outcomes (a perfect run must yield readiness 100 / zero gaps / `ready_pending_validation`; a mixed run must produce the hand-verified competency table).
- **Content validation**: schema-invalid content (`400`, never persisted), wipe-all guard, unknown collections (`404`), repo content files untouched by tests.
- **HTML guards**: role redirects for all roles, 404s for unknown pages and ids.
- **Concurrency**: 25 parallel API reads + 10 parallel page loads.

## Real bugs the campaign found & fixed

These were live defects in the merged code, each caught by a test and fixed:

1. **Cross-adapter state leak** (`JsonAdapter`): the empty-store template was shallow-copied, so record arrays were *shared between adapter instances* — data from one store silently appeared in another (corruption-recovery, scripts, tests). Fixed with deep-copied fresh stores + regression test.
2. **Per-route stale caches** (`JsonAdapter`): Next bundles routes into separate chunks, each with its own adapter instance; an in-memory cache meant a write in one route was invisible to others (observed: logout revocation invisible to `/api/auth/me`). Fixed by making the JSON store stateless (read-per-op, atomic write) — correct for the pilot tier's scale.
3. **Logout didn't revoke sessions**: stateless tokens stayed valid until expiry after "sign out". Fixed with a revocation watermark (`sessionsValidAfter` + `iat` in tokens) — logout now kills all of a user's sessions.
4. **Workflow gate bypass**: a candidate could jump from `enriching` straight to `enterprise_ready`, skipping independent validation. Fixed: `enterprise_ready` is reachable only from `validation`.
5. **Online-section integrity hole**: candidates could resubmit answers while the assessor was scoring. Fixed: submission is frozen at `online_complete`.
6. **Recompute could bypass the assessor**: admin recompute ran on partially-scored data. Fixed: requires completed scoring or existing results.
7. **Content editor could poison the engine**: schema-invalid content (e.g. competency without `threshold` → `NaN` scores) was accepted. Fixed: per-collection schema validation + wipe-all guard.
8. **Malformed JSON → 500** on mutation routes. Fixed: defensive parsing → `400`.
9. **Corrupt store silently reset**. Fixed: file quarantined (`.corrupt-<ts>`) with a loud log before recovery.
10. **1 critical + 2 high CVEs** in Next 15.3.3 (image-optimiser cache confusion, flight RCE, server-actions exposure — mostly in features ECOD doesn't use). Fixed: upgraded to Next 16.3.2; full suite re-run green; `npm audit --omit=dev` now clean.
11. **Login brute force** was unthrottled. Fixed: per-email+IP fixed-window limiter (`ECOD_LOGIN_MAX`, 60s) + `Retry-After`.

## Known limitations (pilot tier — by design or accepted)

- **JSON store is single-instance**: fine for one server process at pilot volume; no cross-process locking. The Airtable adapter is the multi-user MVP backend; Postgres is the scale path (see ARCHITECTURE.md §2). Run one server replica only.
- **Rate limiter is in-memory per instance** — resets on restart, not shared across replicas. Swap for a shared store when you outgrow one instance.
- **Airtable adapter is code-complete but untested against a live base** (no credentials in CI). Provision with `npm run airtable:setup` and run `npm run seed` + `npm run demo:e2e` against it before cut-over; the adapter surface it uses is exactly what the suites exercise on JSON.
- **Sessions**: 7-day stateless tokens with server-side revocation watermark; no per-session invalidation or "log out other sessions" UI yet. Password reset / SSO / invite links are P1 (see ARCHITECTURE.md roadmap).
- **CSRF**: mitigated by `SameSite=Lax` cookies + JSON-content-type mutations; no explicit CSRF tokens. Add tokens if you embed the portal on third-party sites.
- **No observability stack yet**: route errors log to stdout; add request logging/metrics/alerting before scaling the assessor cohort.
- **Backups are an operational procedure, not code** (hourly Airtable/table export; the quarantined-JSON mechanism preserves corrupt files for forensics).
- **Assessment integrity features deferred**: question shuffling/rotation, per-candidate seeds, time-boxing, response-locking beyond the current freeze.

## Recommendation

Fit for purpose as the **internal pilot for the RSA assessment cohort** (tens of candidates, handful of assessors, single deployment) — with `SESSION_SECRET` set, HTTPS terminated by the platform, and the Airtable tier if more than one operator works concurrently. Before opening to external candidates, complete P1 (SSO/invite auth, audit log, notifications) and the observability items above.
