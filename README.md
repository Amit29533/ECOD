# ECOD — Enterprise Capability on Demand

**Candidate Intake → Role Mapping → Assessment → Gap Mapping → Enrichment → Independent Validation → Enterprise Ready**

ECOD identifies experienced technology professionals, assesses them against specific enterprise roles, identifies exact capability gaps, prescribes targeted enrichment, independently validates readiness, and maintains a pool of enterprise-ready talent.

This repository contains the working **MVP of the Assessment Module** (the first milestone): candidate database, role/competency configuration, assessor allocation, assessor workspace, question/assessment engine, automated scoring, capability gap generation, admin dashboard and role-based access — with **all domain content as configurable data** (no code changes needed to add roles, competencies, questions, weights or frameworks).

- **Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS v4 · zero runtime dependencies beyond Next
- **Business logic:** pure TypeScript in `src/domain` (scoring engine, gap generation, workflow state machine, RBAC) — framework-free and portable
- **Storage:** swappable `DataAdapter` — JSON file store (default, zero-config) and **Airtable** adapter included for the MVP production tier; Postgres later without touching business logic
- **See [ARCHITECTURE.md](ARCHITECTURE.md)** for the design decisions, migration path, effort breakdown and open questions.

---

## Quickstart

```bash
npm install
npm run seed        # loads /content + demo data (idempotent)
npm run dev         # http://localhost:3000
```

The store auto-seeds on first request, so `npm run seed` is optional — it just guarantees demo data.

### Demo accounts

| Role | Email | Password | What to try |
| --- | --- | --- | --- |
| Admin | `admin@ecod.io` | `admin123!` | Dashboard, candidate pool, intake form, allocate assessments, gap reports, domain content editor |
| Assessor | `kavitha.rao@ecod.io` | `assess123!` | Score Priya's completed assessment (read-only results view) |
| Assessor | `marcus.lin@ecod.io` | `assess123!` | Arjun's assessment is waiting for scoring once he submits |
| Candidate | `arjun.mehta@example.io` | `cand123!` | Take the RSA knowledge check end-to-end |
| Candidate | `priya.nair@example.io` | `cand123!` | See a completed journey with results + development plan |

**Suggested walkthrough (one RSA candidate end-to-end):**

1. As **Arjun (candidate)**: start the knowledge check → answer → submit (auto-scored instantly).
2. As **Marcus (assessor)**: the assessment appears under *Ready to score* → review Arjun's online results → score the deep-dive + case studies against the rubrics (evidence is mandatory for case studies) → submit.
3. As **Ada (admin)**: open the assessment → competency scores vs thresholds, readiness, outcome, capability gaps and enrichment recommendations are all generated. The candidate's journey page updates automatically.

Reset the demo at any time: `npm run seed:reset`.

### Headless proof

```bash
npm run demo:e2e   # runs the entire flow (intake→allocation→online→scoring→gaps) on a throwaway store and prints the report
```

---

## Using Airtable as the backend

```bash
cp .env.example .env       # set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, DATA_ADAPTER=airtable
npm run airtable:setup     # creates tables + pushes /content seeds
npm run seed               # adds demo candidates/assessment into Airtable
npm run dev
```

Details and the manual alternative: [docs/airtable-setup.md](docs/airtable-setup.md).

## Changing domain content (no developer required)

All assessable content lives in `/content` as reviewable JSON — roles, competency frameworks (weights + thresholds), the question bank (MCQs, expected answers, case-study rubrics), assessment blueprints and the enrichment catalogue. Admins can also edit it live in **Domain content** (validated JSON editor that syncs the running store and writes back to `/content`).

Guide with schemas and worked examples (add a new role, add a question, change a weight): [docs/domain-content-guide.md](docs/domain-content-guide.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop / build / run the portal |
| `npm run seed` / `seed:reset` | Sync content + demo data (reset wipes the store first) |
| `npm run demo:e2e` | Headless end-to-end proof of the assessment flow |
| `npm run airtable:setup` | Provision + seed an Airtable base |
| `npm run typecheck` | Strict TypeScript check |

## Repository layout

```
content/            configurable domain data (roles, competencies, questions, blueprints,
                    enrichment, seed users/candidates) — the "CMS" of the platform
src/domain/         pure business logic: types, scoring engine, gap generation,
                    workflow state machines, RBAC policy (no framework imports)
src/data/           DataAdapter interface + JSON store + Airtable adapter + content I/O
src/lib/            services (the workflow layer used by UI, API and scripts), auth, helpers
src/app/            portal pages (admin / assessor / candidate) + REST API routes
scripts/            seed, e2e demo, Airtable provisioning
docs/               setup + content guides
```
