/**
 * DataAdapter - the single seam between ECOD's business logic and storage.
 *
 * The app (services, API routes, UI) talks ONLY to this interface. Today:
 *   - JsonAdapter   : zero-dependency document store (dev, demo, tests)
 *   - AirtableAdapter: Airtable REST backend for the MVP production tier
 * Tomorrow: a PostgresAdapter implements the same interface and the platform
 * moves without touching business logic, UI or API contracts.
 */

import type {
  Assessment,
  AssessmentBlueprint,
  Candidate,
  Competency,
  ContentCollection,
  EnrichmentItem,
  Question,
  RoleTrack,
  User,
} from "@/domain/types";
import { JsonAdapter } from "./json-adapter";
import { AirtableAdapter } from "./airtable-adapter";

export type Collection =
  | "users"
  | "candidates"
  | "assessments"
  | "roles"
  | "competencies"
  | "questions"
  | "blueprints"
  | "enrichment";

export interface ListOptions {
  /** Simple in-memory predicate (fine at MVP scale; pushed down to the store later). */
  filter?: (record: any) => boolean;
}

export interface DataAdapter {
  readonly kind: "json" | "airtable";
  list<T>(collection: Collection, opts?: ListOptions): Promise<T[]>;
  get<T extends { id: string }>(collection: Collection, id: string): Promise<T | null>;
  /** Find first record where field === value (e.g. email, code). */
  findOne<T>(collection: Collection, field: string, value: string): Promise<T | null>;
  /** Upsert by id. */
  put<T extends { id: string }>(collection: Collection, record: T): Promise<T>;
  putMany<T extends { id: string }>(collection: Collection, records: T[]): Promise<void>;
  /** Replace the entire collection (used by content sync). */
  replaceAll<T extends { id: string }>(collection: Collection, records: T[]): Promise<void>;
  delete(collection: Collection, id: string): Promise<void>;
  /** Number of records across collections - used to detect an empty store. */
  countAll(): Promise<number>;
}

/* Typed collection records so callers get proper types. */
export type UserRecord = User;
export type CandidateRecord = Candidate;
export type AssessmentRecord = Assessment;
export type RoleRecord = RoleTrack;
export type CompetencyRecord = Competency;
export type QuestionRecord = Question;
export type BlueprintRecord = AssessmentBlueprint;
export type EnrichmentRecord = EnrichmentItem;

export const CONTENT_COLLECTIONS: ContentCollection[] = [
  "roles",
  "competencies",
  "questions",
  "blueprints",
  "enrichment",
];

/* ------------------------------------------------------------------ */
/* Factory                                                              */
/* ------------------------------------------------------------------ */

let cached: DataAdapter | null = null;

export function getAdapter(): DataAdapter {
  if (cached) return cached;
  const choice = (process.env.DATA_ADAPTER ?? "json").toLowerCase();
  cached = choice === "airtable" ? new AirtableAdapter() : new JsonAdapter();
  return cached;
}

/** Test/script helper - force a fresh adapter (e.g. temp data file). */
export function resetAdapter(): void {
  cached = null;
}
