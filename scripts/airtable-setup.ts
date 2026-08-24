/**
 * Airtable provisioning for the ECOD MVP backend.
 *
 *   1. cp .env.example .env  (fill AIRTABLE_API_KEY + AIRTABLE_BASE_ID, set DATA_ADAPTER=airtable)
 *   2. npm run airtable:setup
 *
 * Creates the ECOD tables (if missing) via the Airtable Metadata API, then
 * pushes the /content seeds (roles, competencies, questions, blueprints,
 * enrichment) and the seed users (passwords hashed). Candidates/assessments
 * then flow through the same service layer with Airtable as the store.
 */

async function main() {
  const key = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!key || !baseId) {
    console.error(
      "Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID first (see .env.example and docs/airtable-setup.md).",
    );
    process.exit(1);
  }

  const { TABLE_FIELDS } = await import("../src/data/airtable-adapter");
  const api = "https://api.airtable.com/v0";
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // ---- 1. list existing tables ------------------------------------------
  let existing = new Set<string>();
  try {
    const meta = await (await fetch(`${api}/meta/bases/${baseId}/tables`, { headers })).json();
    existing = new Set((meta.tables ?? []).map((t: any) => t.name));
    console.log(`· base has ${existing.size} table(s)`);
  } catch (err) {
    console.error("Could not read base metadata — check the key/base id and token scopes:", err);
    process.exit(1);
  }

  // ---- 2. create missing tables ------------------------------------------
  for (const [collection, spec] of Object.entries(TABLE_FIELDS) as [string, any][]) {
    if (existing.has(spec.name)) {
      console.log(`· table exists: ${spec.name}`);
      continue;
    }
    const fields = [
      ...Object.entries(spec.fields).map(([name, type]) =>
        type === "checkbox" ? { name, type, options: { icon: "check", color: "greenBright" } } : { name, type },
      ),
      { name: "data", type: "multilineText" },
    ];
    const res = await fetch(`${api}/meta/bases/${baseId}/tables`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: spec.name, description: `ECOD ${collection} (managed by ECOD platform)`, fields }),
    });
    if (res.ok) {
      console.log(`· created table: ${spec.name}`);
    } else {
      console.error(`· FAILED to create ${spec.name}: ${await res.text()}`);
      process.exit(1);
    }
  }

  // ---- 3. push content + users -------------------------------------------
  const { syncContentFromFiles, seedUsers } = await import("../src/lib/services");
  process.env.DATA_ADAPTER = "airtable";
  const { resetAdapter } = await import("../src/data/adapter");
  resetAdapter();

  console.log("· syncing domain content from /content …");
  await syncContentFromFiles();
  console.log("· seeding users (hashed) …");
  await seedUsers();

  console.log("\n✔ Airtable base provisioned. Point DATA_ADAPTER=airtable and run the app against it.");
  console.log("  Tip: run `npm run seed` afterwards to add the demo candidates/assessment.");
}

main().catch((err) => {
  console.error("airtable setup failed:", err);
  process.exit(1);
});
