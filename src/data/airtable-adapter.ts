/**
 * AirtableAdapter - ECOD's MVP production backend.
 *
 * Strategy: one Airtable table per collection. Each record carries a small set
 * of queryable scalar columns plus a `data` long-text column holding the full
 * JSON record. This keeps Airtable browsable/editable by non-developers while
 * giving the app a complete, typed view - and keeps THIS adapter simple enough
 * to swap out for Postgres later without touching business logic.
 *
 * Setup: `npm run airtable:setup` (creates tables via the Metadata API and
 * pushes /content seeds) or follow docs/airtable-setup.md to do it by hand.
 */

import type { Collection, DataAdapter, ListOptions } from "./adapter";

const API = "https://api.airtable.com/v0";

interface AirtableConfigError extends Error {}

function requireEnv(): { key: string; base: string } {
  const key = process.env.AIRTABLE_API_KEY;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!key || !base) {
    const err = new Error(
      "DATA_ADAPTER=airtable requires AIRTABLE_API_KEY and AIRTABLE_BASE_ID (see .env.example).",
    ) as AirtableConfigError;
    throw err;
  }
  return { key, base };
}

/**
 * Scalar columns exposed per table. `data` always holds the full JSON record.
 * Field names map the domain; ids/codes make records addressable from the UI.
 */
const TABLE_FIELDS: Record<Collection, { name: string; fields: Record<string, string> }> = {
  users: {
    name: "Users",
    fields: { id: "singleLineText", name: "singleLineText", email: "singleLineText", role: "singleLineText", active: "checkbox" },
  },
  candidates: {
    name: "Candidates",
    fields: { id: "singleLineText", code: "singleLineText", name: "singleLineText", email: "singleLineText", status: "singleLineText" },
  },
  assessments: {
    name: "Assessments",
    fields: { id: "singleLineText", code: "singleLineText", candidateId: "singleLineText", roleCode: "singleLineText", status: "singleLineText", assessorId: "singleLineText" },
  },
  roles: { name: "Roles", fields: { id: "singleLineText", code: "singleLineText", title: "singleLineText", technology: "singleLineText", active: "checkbox" } },
  competencies: { name: "Competencies", fields: { id: "singleLineText", roleCode: "singleLineText", code: "singleLineText", name: "singleLineText" } },
  questions: { name: "Questions", fields: { id: "singleLineText", code: "singleLineText", type: "singleLineText", delivery: "singleLineText", roleCode: "singleLineText" } },
  blueprints: { name: "Blueprints", fields: { id: "singleLineText", code: "singleLineText", roleCode: "singleLineText", name: "singleLineText", active: "checkbox" } },
  enrichment: { name: "Enrichment", fields: { id: "singleLineText", roleCode: "singleLineText", competencyCode: "singleLineText", title: "singleLineText", type: "singleLineText" } },
};

export class AirtableAdapter implements DataAdapter {
  readonly kind = "airtable" as const;
  private key: string;
  private base: string;
  /** airtable recId <-> our record id */
  private recIdCache = new Map<Collection, Map<string, string>>();

  constructor() {
    const { key, base } = requireEnv();
    this.key = key;
    this.base = base;
  }

  private tableName(collection: Collection): string {
    return TABLE_FIELDS[collection].name;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" };
  }

  private async request(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${API}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Airtable ${res.status} on ${path}: ${body.slice(0, 500)}`);
    }
    return res.json();
  }

  private toRecord<T>(row: any): T | null {
    const raw = row.fields?.data;
    if (typeof raw === "string" && raw.trim()) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        /* fall through to field extraction */
      }
    }
    if (!row.fields?.id) return null;
    return { ...row.fields, id: row.fields.id } as T;
  }

  private cacheIds(collection: Collection, rows: any[]): void {
    const map = this.recIdCache.get(collection) ?? new Map<string, string>();
    for (const row of rows) if (row.fields?.id) map.set(row.fields.id, row.id);
    this.recIdCache.set(collection, map);
  }

  async list<T>(collection: Collection, opts?: ListOptions): Promise<T[]> {
    const table = encodeURIComponent(this.tableName(collection));
    const out: T[] = [];
    let offset: string | undefined;
    do {
      const page: any = await this.request(`/${this.base}/${table}?pageSize=100${offset ? `&offset=${offset}` : ""}`);
      this.cacheIds(collection, page.records ?? []);
      for (const row of page.records ?? []) {
        const rec = this.toRecord<T>(row);
        if (rec && (!opts?.filter || opts.filter(rec))) out.push(rec);
      }
      offset = page.offset;
    } while (offset);
    return out;
  }

  private async findRecId(collection: Collection, id: string): Promise<string | null> {
    const cached = this.recIdCache.get(collection)?.get(id);
    if (cached) return cached;
    const table = encodeURIComponent(this.tableName(collection));
    const formula = encodeURIComponent(`{id}="${id}"`);
    const page: any = await this.request(`/${this.base}/${table}?filterByFormula=${formula}&maxRecords=1`);
    const row = (page.records ?? [])[0];
    if (!row) return null;
    this.cacheIds(collection, [row]);
    return row.id;
  }

  private fieldsFor(collection: Collection, record: Record<string, any>): Record<string, any> {
    const fields: Record<string, any> = { data: JSON.stringify(record) };
    for (const key of Object.keys(TABLE_FIELDS[collection].fields)) {
      if (record[key] !== undefined) fields[key] = record[key];
    }
    return fields;
  }

  async get<T extends { id: string }>(collection: Collection, id: string): Promise<T | null> {
    const rows = await this.list<T>(collection, { filter: (r: any) => r.id === id });
    return rows[0] ?? null;
  }

  async findOne<T>(collection: Collection, field: string, value: string): Promise<T | null> {
    const rows = await this.list<T>(collection, { filter: (r: any) => r[field] === value });
    return rows[0] ?? null;
  }

  async put<T extends { id: string }>(collection: Collection, record: T): Promise<T> {
    await this.putMany(collection, [record]);
    return record;
  }

  async putMany<T extends { id: string }>(collection: Collection, records: T[]): Promise<void> {
    const table = encodeURIComponent(this.tableName(collection));
    // Airtable batches 10 records per write call.
    for (let i = 0; i < records.length; i += 10) {
      const chunk = records.slice(i, i + 10);
      const create: any[] = [];
      const update: any[] = [];
      for (const record of chunk) {
        const recId = await this.findRecId(collection, record.id);
        const fields = this.fieldsFor(collection, record);
        if (recId) update.push({ id: recId, fields });
        else create.push({ fields });
      }
      if (create.length) await this.request(`/${this.base}/${table}`, { method: "POST", body: JSON.stringify({ records: create, typecast: true }) });
      if (update.length) await this.request(`/${this.base}/${table}`, { method: "PATCH", body: JSON.stringify({ records: update, typecast: true }) });
    }
  }

  async replaceAll<T extends { id: string }>(collection: Collection, records: T[]): Promise<void> {
    // content sync: simplest correct approach - upsert everything in files.
    await this.putMany(collection, records);
  }

  async delete(collection: Collection, id: string): Promise<void> {
    const recId = await this.findRecId(collection, id);
    if (!recId) return;
    const table = encodeURIComponent(this.tableName(collection));
    await this.request(`/${this.base}/${table}/${recId}`, { method: "DELETE" });
  }

  async countAll(): Promise<number> {
    let total = 0;
    for (const collection of Object.keys(TABLE_FIELDS) as Collection[]) {
      const rows = await this.list(collection);
      total += rows.length;
    }
    return total;
  }
}

export { TABLE_FIELDS };
