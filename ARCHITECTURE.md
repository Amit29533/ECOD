# ECOD Architecture & Decisions

*(This is the "architecture, effort and recommendations" discussion, delivered alongside a working MVP rather than as a paper exercise. **Note:** the attached blueprint document did not come through with the brief — the platform below is built from your summary. Where I inferred details they are flagged in [Open questions](#7-open-questions--decisions-i-recommend). Share the blueprint and I'll reconcile.)*

## 1. What is built (MVP scope)

Your stated priority order, mapped to what exists today:

| # | Priority | Status | Where |
| --- | --- | --- | --- |
| 1 | Candidate database | ✅ | `candidates` store, admin pool view, intake form, per-candidate 360° page, admin-only "internal compartment" (commercials, client notes, rating) |
| 2 | Role/competency configuration | ✅ | `/content/*.json` + live admin editor (`/admin/content`); role tracks, weighted competencies with thresholds |
| 3 | Assessor allocation | ✅ | Admin allocates an assessor per assessment; allocation is the authorisation boundary for the assessor |
| 4 | Assessor portal/workspace | ✅ | `/assessor` — sees **only** allocated assessments; scoring UI with rubrics, expected-answer guides, mandatory evidence for case studies |
| 5 | Question/assessment engine | ✅ | Blueprint-driven sections (online + assessor-led), MCQ auto-scoring, rubric scoring, candidate knowledge-check UI |
| 6 | Automated scoring | ✅ | `src/domain/scoring.ts` — pure engine; item → competency → readiness aggregation; runs on assessor submit and on demand (recompute) |
| 7 | Capability gap generation | ✅ | `src/domain/gaps.ts` — severity (minor/major/critical) + enrichment recommendations from the catalogue |
| 8 | Admin dashboard | ✅ | `/admin` — pipeline funnel, in-flight assessments, avg readiness, open gaps; assessments table with results |
| 9 | Role-based access control | ✅ | `src/domain/rbac.ts` + session auth; enforced in one service layer shared by UI, API and scripts |

**Deliberately deferred (your instruction: don't overbuild):** Enrichment *execution* (programmes, progress tracking), Independent Validation module, and the fuller Candidate Portal. The data model and workflow states already reserve their place (`enrichment_planned`, `enriching`, `validation`, `enterprise_ready`; `trainer`/`validator` roles slot into the RBAC matrix), so these are additive, not rework.

## 2. The layering (and why migration won't hurt)

```
┌───────────────────────────────────────────────────────────────┐
│  UI (Next.js pages)  ·  REST API (/api/*)  ·  scripts         │
├───────────────────────────────────────────────────────────────┤
│  Service layer — src/lib/services.ts                           │
│  THE workflow boundary: every rule (scoping, transitions,     │
│  scoring, gap generation) lives here once, used by everything │
├───────────────────────────────────────────────────────────────┤
│  Domain — src/domain (types, scoring, gaps, workflow, rbac)    │
│  Zero imports. No Next, no fs, no fetch. Portable to any host. │
├───────────────────────────────────────────────────────────────┤
│  DataAdapter — src/data (interface)                            │
│   ├─ JsonAdapter      (dev/demo/tests, zero-dependency)        │
│   ├─ AirtableAdapter  (MVP production tier)                    │
│   └─ PostgresAdapter  (future: same interface, no rewrite)     │
└───────────────────────────────────────────────────────────────┘
```

Concretely: `computeResults()` doesn't know whether records came from Airtable; `submitAssessorScores()` doesn't know whether it was called by the UI, the API or a script. When you outgrow Airtable, you implement `list/get/put/replaceAll` against Postgres and change one env var (`DATA_ADAPTER`). The business logic — the thing that encodes how ECOD *works* — is never rebuilt.

**Airtable strategy:** one table per collection; a few queryable scalar columns (id, code, status, emails) + a `data` column holding the full JSON record. Non-developers can still browse/edit in Airtable; the app gets complete typed records. `npm run airtable:setup` provisions tables and pushes `/content`.

## 3. The assessment & scoring model (configurable, not coded)

Everything below is data in `/content` — adding a second technology (e.g. Snowflake RSA) or a second track means new JSON, not new code:

- **Role track** — technology, description, overall pass mark.
- **Competencies** — per role: `weight` (contribution to readiness, sums to 100) and `threshold` (the score required to "meet" it). *Enterprise-ready = overall readiness ≥ pass mark AND every competency ≥ threshold* — no unexplained weak spots.
- **Questions** — MCQ (auto-scored, with expected answer + explanation for reports), short answers and case studies with **criterion rubrics** (4 levels each with descriptors). Rubric criteria can map to a specific competency (`competencyCode`), so one 5-criterion case study feeds five competencies precisely rather than flooding all of them with one score.
- **Blueprint** — sections (online / assessor), question selection, section weights. An item's effective weight = `question.weight × section.weight`.

Scoring pipeline on assessor submit:

```
item scores (auto or rubric) ──► competency scores (weighted mean of items,
                                 criterion-mapped where configured)
                             ──► readiness score (competency-weighted mean)
                             ──► outcome: ready_pending_validation |
                                        enrichment_required | not_ready
                             ──► gap map (severity) + enrichment recommendations
```

Gap severity: `threshold − score` → ≤10 minor, ≤25 major, >25 critical. Recommendations come from the enrichment catalogue ranked project → lab → course → reading.

## 4. Compartmentalisation

The principle you emphasised is enforced structurally, not by UI convention:

- **Authorisation is scoped in the service layer** (`listAssessmentsFor`, `canViewAssessment`): an assessor's every read/write is filtered to assessments allocated to them. There is no API path by which an assessor can enumerate the pool (verified: `403`).
- **Sanitisation on read**: `sanitizeCandidate()` strips the `internal` compartment (commercials, client notes, ratings) from every non-admin view — pages, API responses, exports (verified in the e2e script).
- **Navigation is per-role**: assessors never even see links to pool/commercial surfaces.
- Cross-tenant attempts return `403` (verified: assessor A scoring assessor B's assessment).
- Phase 2 trainers/validators get the same treatment: allocated scope, no pool visibility.

## 5. Effort & roadmap estimate

Assuming ~1 senior full-timer + domain content from your side:

| Phase | Scope | Estimate |
| --- | --- | --- |
| **P0 (done)** | Assessment module end-to-end, RBAC, admin dashboard, Airtable path | ~2.5–3 weeks (built) |
| P1 | Harden auth (SSO/invite links, password reset), audit log of every state change, notifications/email, per-question timing | 1–1.5 weeks |
| P2 | **Enrichment module**: programmes from the catalogue, trainer workspace, progress tracking, re-assessment of gapped competencies only | 2–3 weeks |
| P3 | **Independent validation**: separate validator role, validation blueprints, sign-off workflow, `enterprise_ready` certification + talent pool views | 2 weeks |
| P4 | Candidate portal depth (profile, scheduling, comms), reporting/exports, Postgres migration when volume justifies it | 2–3 weeks |

Content authoring (real RSA question bank, rubrics, enrichment material) runs in parallel and is the usual critical path — the platform is deliberately content-ready now.

## 6. Recommendations

1. **Keep the blueprint in git** (`/content`) even in Airtable mode: it gives review history on assessment frameworks — effectively version-controlled exam boards.
2. **Blueprint versioning on day one is already in place** (`version` field) — freeze a copy per assessment at allocation time before you scale (currently the live blueprint is referenced; add snapshotting when you first revise a live blueprint).
3. **Airtable is right for the pilot**, but put a thin backup job in place early (hourly export of the base via the API) — the JSON adapter can serve as the restore target.
4. **Assessment integrity for later**: question banks with rotation/shuffling, per-candidate seeds, time-boxing. Deferred deliberately.
5. **Make validation genuinely independent**: validators should not see assessor scores or gap history, only the competency framework — the RBAC pattern already supports this.

## 7. Open questions / decisions I recommend

1. **Blueprint document**: please share it — I'll reconcile terminology (e.g. if you already have competency codes/weights or RSA question banks, they slot straight into `/content`).
2. **Assessor-led delivery**: MVP assumes written responses scored against rubrics. If RSA assessment is live/viva-based, we add a session-scheduling field + structured score entry (UI already supports the scoring side).
3. **Multi-assessor per assessment**: current model allocates one assessor (with per-criterion scores recorded). If you want two assessors + moderation, that's a small schema addition (scores keyed by assessor) — worth deciding before the pilot cohort.
4. **Candidate accounts**: seeded manually today. Should intake generate an invite link automatically? (P1.)
5. **Scoring politics**: thresholds currently require *every* competency met. I'd keep that for "enterprise ready" but let admins override with a note — want an override control?
