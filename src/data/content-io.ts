/**
 * Content I/O - reads/writes the configurable domain content in /content.
 *
 * The /content directory is the version-controlled source of truth for domain
 * content (roles, competencies, questions, blueprints, enrichment). It is
 * synced into the active DataAdapter on seed; the admin content editor writes
 * edits back through the adapter AND to these files (in json mode) so content
 * stays reviewable in git. In airtable mode Airtable itself is the editable
 * source and files are just the bootstrap payload.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ContentCollection } from "@/domain/types";

const CONTENT_DIR = resolve(process.cwd(), "content");

export function readContentFile<T>(collection: ContentCollection): T[] {
  const path = resolve(CONTENT_DIR, `${collection}.json`);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as T[];
}

export function writeContentFile<T>(collection: ContentCollection, records: T[]): void {
  mkdirSync(CONTENT_DIR, { recursive: true });
  const path = resolve(CONTENT_DIR, `${collection}.json`);
  writeFileSync(path, JSON.stringify(records, null, 2) + "\n", "utf8");
}
