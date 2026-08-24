# Airtable Setup (MVP production backend)

ECOD runs on Airtable by flipping one environment variable. Two ways to set it up:

## Option A — automated (recommended)

1. Create an empty Airtable base (any name, e.g. **ECOD**).
2. Create a personal access token with scopes: `data.records:read`, `data.records:write`, `schema.bases:write` (needed only for table creation).
3. In `.env` (copy from `.env.example`):

   ```
   DATA_ADAPTER=airtable
   AIRTABLE_API_KEY=patXXX...
   AIRTABLE_BASE_ID=appXXX...
   ```

4. Run:

   ```bash
   npm run airtable:setup   # creates tables + pushes /content + seed users
   npm run seed             # optional: adds the demo candidates & assessment
   npm run dev
   ```

## Option B — manual

Create these tables in your base (exact names). Every table gets the listed columns **plus a long-text column named `data`** (the app stores the full typed record there; the scalar columns are for browsing/filtering in Airtable itself).

| Table | Columns (type) | Purpose |
| --- | --- | --- |
| `Users` | id (single line), name, email, role, active (checkbox) + `data` | Logins & roles (passwords stored hashed inside `data`) |
| `Candidates` | id, code, name, email, status + `data` | Candidate pool |
| `Assessments` | id, code, candidateId, roleCode, status, assessorId + `data` | Assessment instances, answers, scores, results |
| `Roles` | id, code, title, technology, active (checkbox) + `data` | Role tracks (RSA…) |
| `Competencies` | id, roleCode, code, name + `data` | Weighted competency frameworks |
| `Questions` | id, code, type, delivery, roleCode + `data` | Question bank incl. rubrics & expected answers |
| `Blueprints` | id, code, roleCode, name, active (checkbox) + `data` | Assessment blueprints |
| `Enrichment` | id, roleCode, competencyCode, title, type + `data` | Enrichment catalogue |

Then run `npm run airtable:setup` (it will detect the tables exist and just push content) or `npm run seed`.

## Notes

- **Record identity**: the `id` column holds ECOD's own ids; never edit it in Airtable. Everything else in the scalar columns is safe to browse; structured edits should go through the admin content editor so validation + write-back to `/content` both happen.
- **Nested data** (rubrics, answers, results, the internal compartment) lives inside `data` as JSON — including `Candidates.data.internal`, which holds the admin-only commercial compartment. Restrict base access accordingly: assessors should not be given Airtable access at all; the portal is their interface.
- **Scale**: the adapter paginates through all records per collection per query — comfortable into thousands of records. When the pool grows past that, add `filterByFormula` push-downs or move to the Postgres adapter (see ARCHITECTURE.md §2).
- **Backups**: `curl -H "Authorization: Bearer $KEY" .../v0/{baseId}/{tableName}` on a schedule, or use Airtable's snapshots. The JSON adapter can act as a restore target.
