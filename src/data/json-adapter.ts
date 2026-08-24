/**
 * JsonAdapter - dependency-free document store for dev, demos and scripts.
 *
 * One JSON file on disk (./data/ecod.json by default). Every operation reads
 * the CURRENT file state and mutations write atomically (tmp + rename). There
 * is deliberately NO long-lived in-memory cache: Next.js production bundles
 * routes into separate chunks, and per-instance caches were observed going
 * stale across routes (a write in /api/auth/logout was invisible to
 * /api/auth/me). File I/O is synchronous inside async methods, so operations
 * never interleave within a process. Adequate for the pilot tier this
 * platform launches with; Airtable/Postgres adapters take over at scale.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Collection, DataAdapter, ListOptions } from "./adapter";

interface StoreShape {
  [collection: string]: Array<Record<string, any>>;
}

function freshStore(): StoreShape {
  // deep-fresh copy every time - never share arrays between reads/instances
  return structuredClone({
    users: [],
    candidates: [],
    assessments: [],
    roles: [],
    competencies: [],
    questions: [],
    blueprints: [],
    enrichment: [],
  });
}

export class JsonAdapter implements DataAdapter {
  readonly kind = "json" as const;
  private file: string;

  constructor(file?: string) {
    this.file = resolve(process.cwd(), file ?? process.env.DATA_FILE ?? "./data/ecod.json");
  }

  private read(): StoreShape {
    if (!existsSync(this.file)) return freshStore();
    let parsed: StoreShape;
    try {
      parsed = JSON.parse(readFileSync(this.file, "utf8")) as StoreShape;
    } catch (err) {
      // Corrupt store: preserve the file for forensics, quarantine it, and
      // recover empty (ensureSeeded() rebuilds content+users). Runtime records
      // (candidates/assessments) are NOT silently regenerable - restore them
      // from the quarantined file or a backup.
      const quarantine = `${this.file}.corrupt-${Date.now()}`;
      try {
        renameSync(this.file, quarantine);
      } catch {
        /* best effort */
      }
      console.error(
        `[ecod] data store at ${this.file} was corrupt (${(err as Error).message}); quarantined as ${quarantine}. Starting empty and re-seeding.`,
      );
      return freshStore();
    }
    const store = freshStore();
    for (const [key, rows] of Object.entries(parsed)) {
      if (Array.isArray(rows)) store[key] = rows;
    }
    return store;
  }

  private write(store: StoreShape): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
    renameSync(tmp, this.file); // atomic-ish swap
  }

  async list<T>(collection: Collection, opts?: ListOptions): Promise<T[]> {
    const rows = this.read()[collection] ?? [];
    return (opts?.filter ? rows.filter(opts.filter) : rows).map((r) => structuredClone(r)) as T[];
  }

  async get<T extends { id: string }>(collection: Collection, id: string): Promise<T | null> {
    const row = (this.read()[collection] ?? []).find((r) => r.id === id);
    return row ? (structuredClone(row) as T) : null;
  }

  async findOne<T>(collection: Collection, field: string, value: string): Promise<T | null> {
    const row = (this.read()[collection] ?? []).find((r) => r[field] === value);
    return row ? (structuredClone(row) as T) : null;
  }

  async put<T extends { id: string }>(collection: Collection, record: T): Promise<T> {
    return this.putMany(collection, [record]).then(() => structuredClone(record) as T);
  }

  async putMany<T extends { id: string }>(collection: Collection, records: T[]): Promise<void> {
    const store = this.read();
    const rows = store[collection] ?? [];
    for (const record of records) {
      const idx = rows.findIndex((r) => r.id === record.id);
      const clone = structuredClone(record);
      if (idx >= 0) rows[idx] = clone;
      else rows.push(clone);
    }
    store[collection] = rows;
    this.write(store);
  }

  async replaceAll<T extends { id: string }>(collection: Collection, records: T[]): Promise<void> {
    const store = this.read();
    store[collection] = records.map((r) => structuredClone(r));
    this.write(store);
  }

  async delete(collection: Collection, id: string): Promise<void> {
    const store = this.read();
    const rows = store[collection] ?? [];
    const idx = rows.findIndex((r) => r.id === id);
    if (idx >= 0) rows.splice(idx, 1);
    store[collection] = rows;
    this.write(store);
  }

  async countAll(): Promise<number> {
    return Object.values(this.read()).reduce((n, rows) => n + rows.length, 0);
  }
}
