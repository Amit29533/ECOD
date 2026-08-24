# Domain Content Guide

Everything assessable in ECOD is **data** — no deployment required to add a technology, role, competency, question, weight or assessment framework. Two equivalent ways to change it:

1. **Live** (admin): *Domain content* → pick a collection → edit the JSON → **Validate & save**. Saves sync the running store immediately and (in file-backed mode) write back to `/content` so the change is reviewable in git.
2. **In git**: edit `content/*.json` and run `npm run seed` (or restart with an empty store) to sync.

> When `DATA_ADAPTER=airtable`, the Airtable base is the live store; `/content` remains the bootstrap payload for new bases.

## Collections

### `content/roles.json` — role tracks

```json
{
  "id": "role-rsa", "code": "RSA", "title": "Resident Solutions Architect",
  "technology": "Databricks", "description": "…",
  "passMark": 70, "active": true
}
```

`passMark` = overall readiness (0–100) required. Add a new track (e.g. `SNOW-RSA`) by adding a record — nothing else to touch until you add its competencies/questions.

### `content/competencies.json` — competency frameworks

```json
{
  "id": "comp-rsa-01", "roleCode": "RSA", "code": "RSA.PLATFORM",
  "name": "Databricks Platform & Workspace Operations", "group": "Platform",
  "description": "…",
  "weight": 12,     // % contribution to readiness — weights should total 100 per role
  "threshold": 70,  // score (0–100) required to 'meet' this competency
  "order": 1
}
```

**Enterprise-ready requires every competency ≥ its threshold** — a strong average with one weak competency still produces a gap.

### `content/questions.json` — the question bank

Common fields: `id`, `code`, `type` (`mcq` | `multi-select` | `short-answer` | `case-study`), `roleCode`, `delivery` (`online` | `assessor`), `prompt`, `context?`, `competencyCodes[]`, `weight`, `difficulty`, `tags[]`.

**Auto-scored MCQ:**

```json
{
  "id": "q-rsa-001", "code": "Q-RSA-001", "type": "mcq", "roleCode": "RSA", "delivery": "online",
  "prompt": "…?",
  "options": [{ "id": "a", "text": "…" }, { "id": "b", "text": "…" }],
  "expectedAnswer": "b",
  "explanation": "Shown to assessors/admins in results",
  "competencyCodes": ["RSA.PLATFORM"], "weight": 1, "difficulty": "foundation", "tags": ["rbac"]
}
```

For `multi-select`, `expectedAnswer` is a comma-separated option list, e.g. `"a,c"` (partial credit with miss penalty).

**Rubric-scored item (short answer / case study):**

```json
{
  "id": "q-rsa-201", "code": "Q-RSA-201", "type": "case-study", "roleCode": "RSA", "delivery": "assessor",
  "context": "Customer scenario…", "prompt": "…",
  "expectedAnswer": "Model answer for the assessor",
  "expectedEvidence": "What a strong answer contains",
  "rubric": [
    {
      "code": "GOV", "label": "Governance & security",
      "competencyCode": "RSA.GOVERNANCE",     // optional: routes this criterion to one competency
      "weight": 1,
      "levels": [
        { "score": 0,   "label": "Inadequate",  "descriptor": "…" },
        { "score": 40,  "label": "Developing",  "descriptor": "…" },
        { "score": 70,  "label": "Proficient",  "descriptor": "…" },
        { "score": 100, "label": "Expert",      "descriptor": "…" }
      ]
    }
  ],
  "competencyCodes": ["RSA.ARCHCONSULT", "RSA.DELTA", "RSA.GOVERNANCE"],
  "weight": 3, "difficulty": "advanced", "tags": ["case-study"]
}
```

Scoring rules:

- An item's effective weight = `weight × section weight` (from the blueprint).
- With `competencyCode` on criteria, each competency receives **only its criteria's** share of the item — one case study can feed several competencies precisely.
- Without criterion mapping, the item's overall score feeds each listed competency.
- Evidence is mandatory for `case-study` items.

### `content/blueprints.json` — assessment blueprints

```json
{
  "id": "bp-rsa-std-v1", "code": "RSA-STD-V1", "roleCode": "RSA",
  "name": "RSA Standard Assessment v1", "version": "1.0", "passMark": 70,
  "sections": [
    { "id": "sec-a", "name": "Section A — Knowledge Check", "delivery": "online",
      "instructions": "…", "questionCodes": ["Q-RSA-001", "…"], "weight": 40 },
    { "id": "sec-c", "name": "Section C — Case Study", "delivery": "assessor",
      "instructions": "…", "questionCodes": ["Q-RSA-201", "Q-RSA-202"], "weight": 35 }
  ],
  "active": true
}
```

Multiple blueprints per role are fine (e.g. a shortened re-assessment covering only gapped competencies — useful in the enrichment phase).

### `content/enrichment.json` — enrichment catalogue

```json
{ "id": "e-rsa-05", "roleCode": "RSA", "competencyCode": "RSA.STREAMING",
  "title": "Structured Streaming: Watermarks & State Lab", "type": "lab",
  "provider": "ECOD lab catalogue", "durationHrs": 5, "url": "https://…", "description": "…" }
```

Gap reports recommend up to 3 items per gapped competency, ranked project → lab → course → reading.

### `content/users.json` / `content/seed-candidates.json`

Bootstrap payloads (hashed on load). Day-to-day, create users in **Users & access** and candidates via the intake form. `seed-candidates.json` includes an `internal` block demonstrating the admin-only compartment.

## Worked example: add a new technology track

1. `roles.json` → add `{ "code": "GCP-DATAENG", … } }`.
2. `competencies.json` → add that role's competencies (weights total ~100, set thresholds).
3. `questions.json` → add questions with `roleCode: "GCP-DATAENG"`.
4. `blueprints.json` → add a blueprint selecting those questions.
5. `enrichment.json` → map enrichment to the new competency codes.
6. Admin → *Domain content* → save each (or commit + `npm run seed`).
7. Open a candidate's page → the new blueprint appears in *Map to role track* immediately.

## Authoring guidance

- Give every competency **at least two assessed items**; a single item makes the threshold binary.
- Prefer 4-level rubrics (0/40/70/100) with concrete descriptors — assessors score to descriptors, not vibes.
- Map case-study criteria to competencies (`competencyCode`) so multi-competency cases score precisely.
- Keep `explanation` on MCQs: it surfaces in results and turns every wrong answer into a coaching point.
