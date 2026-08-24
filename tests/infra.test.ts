/**
 * Unit tests: rate limiter + JSON adapter (persistence, atomicity, corruption recovery).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rateLimit } from "../src/lib/rate-limit";
import { JsonAdapter } from "../src/data/json-adapter";

test("rate limiter: allows up to max inside the window, blocks after, resets after window", async () => {
  const key = `k-${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3, 60).allowed, true);
  const blocked = rateLimit(key, 3, 60);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  // window expiry frees the bucket
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(rateLimit(`short-${Math.random()}`, 1, 30).allowed, true);
  const k2 = `short2-${Math.random()}`;
  rateLimit(k2, 1, 30);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(rateLimit(k2, 1, 30).allowed, true);
});

test("JSON adapter: put/get/list/delete round-trips and persists to disk atomically", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ecod-store-"));
  const file = join(dir, "store.json");
  const a = new JsonAdapter(file);
  await a.put("users", { id: "u1", name: "A" });
  await a.put("users", { id: "u2", name: "B" });
  await a.put("users", { id: "u1", name: "A2" }); // upsert
  assert.equal((await a.list("users")).length, 2);
  assert.equal((await a.get<any>("users", "u1"))!.name, "A2");
  assert.equal(await a.get("users", "nope"), null);
  const found = await a.findOne<any>("users", "name", "B");
  assert.equal(found.id, "u2");
  // persisted + valid JSON
  const onDisk = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(onDisk.users.length, 2);
  assert.ok(!existsSync(`${file}.tmp`)); // no temp litter
  // fresh instance sees the same data
  const b = new JsonAdapter(file);
  assert.equal((await b.list("users")).length, 2);
  // delete + replaceAll
  await b.delete("users", "u1");
  assert.equal((await b.list("users")).length, 1);
  await b.replaceAll("users", [{ id: "x" }, { id: "y" }, { id: "z" }]);
  assert.equal((await b.list("users")).length, 3);
  // in-memory filter predicate
  assert.equal((await b.list("users", { filter: (r) => r.id !== "y" })).length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("JSON adapter: corrupt store is quarantined (never silently discarded), adapter recovers empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ecod-corrupt-"));
  const file = join(dir, "store.json");
  writeFileSync(file, "{ this is not valid json !!!", "utf8");
  const a = new JsonAdapter(file);
  assert.equal(await a.countAll(), 0); // recovered empty
  const quarantined = readdirSync(dir).find((f) => f.includes(".corrupt-"));
  assert.ok(quarantined, "corrupt file should be preserved for forensics");
  assert.ok(readFileSync(join(dir, quarantined!), "utf8").includes("not valid"));
  // and the adapter is usable afterwards
  await a.put("users", { id: "u1", name: "A" });
  assert.equal((await a.list("users")).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("REGRESSION: two adapter instances never share record arrays (cross-instance leak)", async () => {
  const dirA = mkdtempSync(join(tmpdir(), "ecod-reg-a-"));
  const dirB = mkdtempSync(join(tmpdir(), "ecod-reg-b-"));
  const first = new JsonAdapter(join(dirA, "s.json"));
  await first.put("users", { id: "u1", name: "Leaky" });
  // a completely separate adapter on a different file must start empty
  const second = new JsonAdapter(join(dirB, "s.json"));
  assert.equal(await second.countAll(), 0);
  assert.equal((await second.list("users")).length, 0);
  // ...and after the first adapter recovers from corruption it must not
  // inherit the first adapter's records via shared module state
  const fileC = join(dirB, "c.json");
  writeFileSync(fileC, "{{{broken", "utf8");
  const third = new JsonAdapter(fileC);
  await third.put("users", { id: "u9", name: "Nine" });
  assert.deepEqual((await third.list("users")).map((u: any) => u.id), ["u9"]);
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});
