/**
 * JsonAdapter - dependency-free document store for dev, demos and scripts.
 *
 * One JSON file on disk (./data/ecod.json by default), kept in memory and
 * written atomically on mutation. Perfectly adequate for the MVP tier this
 * platform launches with; production scale is Airtable today (see
 * airtable-adapter.ts) and Postgres later - same interface, no rewrite.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Collection, DataAdapter, ListOptions } from "./adapter";

interface StoreShape {
  [collection: string]: Array<Record<string, any>>;
}

const EMPTY: StoreShape = {
  users: [],
  candidates: [],
  assessments: [],
  roles: [],
  competencies: [],
  questions: [],
  blueprints: [],
  enrichment: [],
};

export class JsonAdapter implements DataAdapter {
  readonly kind = "json" as const;
  private file: string;
  private store: StoreShape | null = null;

  constructor(file?: string) {
    this.file = resolve(process.cwd(), file ?? process.env.DATA_FILE ?? "./data/ecod.json");
  }

  private load(): StoreShape {
    if (this.store) return this.store;
    if (existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, "utf8")) as StoreShape;
        this.store = { ...EMPTY, ...parsed };
      } catch (err) {
        // Corrupt store: preserve the file for forensics, quarantine it, and
        // recover with an empty store (ensureSeeded() rebuilds content+users).
        // Runtime records (candidates/assessments) are NOT silently regenerable -
        // restore them from the quarantined file or a backup.
        const quarantine = `${this.file}.corrupt-${Date.now()}`;
        try {
          renameSync(this.file, quarantine);
        } catch {
          /* best effort */
        }
        console.error(
          `[ecod] data store at ${this.file} was corrupt (${(err as Error).message}); quarantined as ${quarantine}. Starting empty and re-seeding.`,
        );
        this.store = { ...EMPTY };
      }
    } else {
      this.store = { ...EMPTY };
    }
    return this.store;
  }

  private flush(): void {
    const store = this.load();
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
    renameSync(tmp, this.file); // atomic-ish swap
  }

  private async delay(): Promise<void> {
    // keeps the interface honestly async so callers never assume sync I/O
    await new Promise((r) => setImmediate(r));
  }

  async list<T>(collection: Collection, opts?: ListOptions): Promise<T[]> {
    await this.delay();
    const rows = this.load()[collection] ?? [];
    return (opts?.filter ? rows.filter(opts.filter) : rows).map((r) => structuredClone(r)) as T[];
  }

  async get<T extends { id: string }>(collection: Collection, id: string): Promise<T | null> {
    await this.delay();
    const row = (this.load()[collection] ?? []).find((r) => r.id === id);
    return row ? (structuredClone(row) as T) : null;
  }

  async findOne<T>(collection: Collection, field: string, value: string): Promise<T | null> {
    await this.delay();
    const row = (this.load()[collection] ?? []).find((r) => r[field] === value);
    return row ? (structuredClone(row) as T) : null;
  }

  async put<T extends { id: string }>(collection: Collection, record: T): Promise<T> {
    await this.delay();
    const rows = this.load()[collection] ?? [];
    const idx = rows.findIndex((r) => r.id === record.id);
    const clone = structuredClone(record);
    if (idx >= 0) rows[idx] = clone;
    else rows.push(clone);
    this.flush();
    return structuredClone(clone) as T;
  }

  async putMany<T extends { id: string }>(collection: Collection, records: T[]): Promise<void> {
    await this.delay();
    const rows = this.load()[collection] ?? [];
    for (const record of records) {
      const idx = rows.findIndex((r) => r.id === record.id);
      const clone = structuredClone(record);
      if (idx >= 0) rows[idx] = clone;
      else rows.push(clone);
    }
    this.flush();
  }

  async replaceAll<T extends { id: string }>(collection: Collection, records: T[]): Promise<void> {
    await this.delay();
    this.load()[collection] = records.map((r) => structuredClone(r));
    this.flush();
  }

  async delete(collection: Collection, id: string): Promise<void> {
    await this.delay();
    const rows = this.load()[collection] ?? [];
    const idx = rows.findIndex((r) => r.id === id);
    if (idx >= 0) rows.splice(idx, 1);
    this.flush();
  }

  async countAll(): Promise<number> {
    await this.delay();
    const store = this.load();
    return Object.values(store).reduce((n, rows) => n + rows.length, 0);
  }
}
