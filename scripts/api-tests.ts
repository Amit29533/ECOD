/**
 * Black-box HTTP test suite.
 *
 * Boots the PRODUCTION build (next start) on an isolated port with a throwaway
 * store, then exercises the public surface like a hostile client: auth (incl.
 * brute force + cookie tampering), the full RBAC matrix, cross-tenant access
 * attempts, the complete assessment workflow (with exact engine outcomes),
 * content-validation guards, HTML route guards and concurrency.
 *
 *   npm run build && npm run test:api
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// argv[1] = this script -> repo root two levels up (import.meta is unreliable under tsx CJS)
const ROOT = resolve(process.argv[1] ?? process.cwd(), "..", "..");
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_FILE = join(mkdtempSync(join(tmpdir(), "ecod-api-")), "store.json");

if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
  console.error("No production build found - run `npm run build` first.");
  process.exit(1);
}

/* ---------------------------- tiny harness ---------------------------- */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n■ ${title}`);
}

interface Res {
  status: number;
  body: any;
  headers: Headers;
  text: string;
}

async function call(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown; raw?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined || opts.raw !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    redirect: "manual",
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, body, headers: res.headers, text };
}

async function login(email: string, password: string): Promise<{ cookie: string; setCookie: string[] }> {
  const res = await call("POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const token = cookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("ecod_session="));
  if (!token) throw new Error(`no session cookie for ${email}`);
  return { cookie: token, setCookie: cookies };
}

/* ------------------------- start the server --------------------------- */

console.log(`booting production server on :${PORT} (throwaway store ${DATA_FILE})`);
const server: ChildProcess = spawn("npx", ["next", "start", "-H", "127.0.0.1", `-p`, String(PORT)], {
  cwd: ROOT,
  env: {
    ...process.env,
    DATA_FILE,
    SESSION_SECRET: "api-test-secret",
    ECOD_LOGIN_MAX: "5",
    ECOD_CONTENT_WRITEBACK: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // own process group so teardown can kill npx + next-server together
});
let serverLog = "";
server.stderr?.on("data", (d) => (serverLog += d.toString()));
server.stdout?.on("data", (d) => (serverLog += d.toString()));

async function waitForServer(): Promise<boolean> {
  // Refuse to run against a squatter: a leftover server on the port would get
  // tested instead of our throwaway instance (this bit us once - stale build,
  // stale store, phantom failures).
  try {
    const squatter = await fetch(`${BASE}/login`, { redirect: "manual" });
    if (squatter.status < 500) {
      console.error(`something is already serving on :${PORT} - kill it first (fuser -k ${PORT}/tcp).`);
      process.exit(2);
    }
  } catch {
    /* port free - good */
  }
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: "manual" });
      if (res.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/* ------------------------------ scenarios ----------------------------- */

async function main(): Promise<void> {
  if (!(await waitForServer())) {
    console.error("server did not start:\n" + serverLog.slice(-2000));
    process.exitCode = 1;
    return;
  }

  /* ---- auth ---- */
  section("auth: credentials, cookies, brute force");
  const admin = await login("admin@ecod.io", "admin123!");
  // candidate user A must exist before we can log in as one (admin-only operation)
  await call("POST", "/api/users", {
    cookie: admin.cookie,
    body: { name: "Cand A", email: "cand.a@example.io", role: "candidate", password: "cand-pass-123" },
  });
  const candidateA = await login("cand.a@example.io", "cand-pass-123");
  const assessor = await login("kavitha.rao@ecod.io", "assess123!");
  {
    const bad = await call("POST", "/api/auth/login", { body: { email: "admin@ecod.io", password: "nope" } });
    check("wrong password -> 401", bad.status === 401);
    const missing = await call("POST", "/api/auth/login", { body: { email: "admin@ecod.io" } });
    check("missing password -> 400", missing.status === 400);
    const malformed = await call("POST", "/api/auth/login", { raw: "{not json" });
    check("malformed JSON -> 400 (not 500)", malformed.status === 400);
    const ghost = await call("POST", "/api/auth/login", { body: { email: "ghost@ecod.io", password: "whatever1" } });
    check("unknown user -> 401 (no user enumeration)", ghost.status === 401);

    const cookieHeader = admin.setCookie.find((c) => c.startsWith("ecod_session=")) ?? "";
    check("session cookie is HttpOnly", /HttpOnly/i.test(cookieHeader));
    check("session cookie is SameSite=Lax", /SameSite=Lax/i.test(cookieHeader));
    check("session cookie is Secure in production", /Secure/i.test(cookieHeader));

    const me = await call("GET", "/api/auth/me", { cookie: admin.cookie });
    check("me -> 200 with role", me.status === 200 && me.body.user?.role === "admin");
    const tampered = await call("GET", "/api/auth/me", {
      cookie: admin.cookie.slice(0, -4) + "AAAA",
    });
    check("tampered session cookie -> 401", tampered.status === 401);
    const forged = await call("GET", "/api/auth/me", {
      cookie: "ecod_session=eyJ1c2VySWQiOiJ1LWFkbWluIn0.Zm9yZ2Vk",
    });
    check("forged (wrongly signed) cookie -> 401", forged.status === 401);

    // brute force: ECOD_LOGIN_MAX=5 -> 6th attempt locked out (sacrificial identity)
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const r = await call("POST", "/api/auth/login", { body: { email: "victim@example.io", password: `wrong-${i}` } });
      last = r.status;
    }
    check("6th failed login -> 429 rate limited", last === 429, `got ${last}`);
    const stillLocked = await call("POST", "/api/auth/login", { body: { email: "victim@example.io", password: "correct-horse" } });
    check("locked identity stays locked within window", stillLocked.status === 429);

    const logout = await call("POST", "/api/auth/logout", { cookie: admin.cookie });
    const afterLogout = await call("GET", "/api/auth/me", { cookie: admin.cookie });
    check(
      "logout -> 200, token revoked server-side",
      logout.status === 200 && afterLogout.status === 401,
      `me after logout: ${afterLogout.status}`,
    );

    // re-login admin for the rest of the suite (session above was destroyed)
    Object.assign(admin, await login("admin@ecod.io", "admin123!"));
  }

  /* ---- RBAC matrix ---- */
  section("RBAC matrix: every role against every sensitive endpoint");
  {
    const cases: [string, string, string, Record<string, string | undefined>, number][] = [
      ["GET", "/api/candidates", "candidate pool", { admin: admin.cookie }, 200],
      ["GET", "/api/candidates", "candidate pool", { assessor: assessor.cookie }, 403],
      ["GET", "/api/candidates", "candidate pool", { candidate: candidateA.cookie }, 403],
      ["GET", "/api/candidates", "candidate pool", {}, 401],
      ["POST", "/api/candidates", "intake", { assessor: assessor.cookie }, 403],
      ["POST", "/api/candidates", "intake", { candidate: candidateA.cookie }, 403],
      ["GET", "/api/users", "user list", { assessor: assessor.cookie }, 403],
      ["POST", "/api/users", "user create", { assessor: assessor.cookie }, 403],
      ["GET", "/api/content/questions", "content read", { assessor: assessor.cookie }, 403],
      ["GET", "/api/content/questions", "content read", { candidate: candidateA.cookie }, 403],
      ["PUT", "/api/content/questions", "content write", { assessor: assessor.cookie }, 403],
      ["POST", "/api/assessments", "assessment create", { assessor: assessor.cookie }, 403],
      ["POST", "/api/assessments", "assessment create", { candidate: candidateA.cookie }, 403],
      ["GET", "/api/assessments", "assessment list", {}, 401],
    ];
    for (const [method, path, label, cookies, expected] of cases) {
      const who = Object.keys(cookies)[0] ?? "anonymous";
      const res = await call(method, path, { cookie: Object.values(cookies)[0], body: method === "GET" ? undefined : {} });
      check(`${who} ${method} ${path} (${label}) -> ${expected}`, res.status === expected, `got ${res.status}`);
    }
    const method405 = await call("PUT", "/api/candidates", { cookie: admin.cookie, body: {} });
    check("unsupported method -> 405", method405.status === 405, `got ${method405.status}`);
  }

  /* ---- full workflow over HTTP ---- */
  section("workflow: intake -> allocation -> online -> scoring -> gaps (HTTP only)");
  let assessmentAId = "";
  let assessmentBId = "";
  {
    // intake
    const createA = await call("POST", "/api/candidates", {
      cookie: admin.cookie,
      body: {
        name: "Cand A", email: "cand.a@example.io", currentRole: "Data Engineer", yearsExperience: 7,
        skills: "PySpark, SQL", technologies: "Databricks", source: "api-test",
        internalCommercialTerms: "rate card X", internalClientNotes: "Acme slot Q4", internalRating: "A",
      },
    });
    check(
      "intake A -> 201",
      createA.status === 201 && createA.body.candidate?.status === "intake",
      `got ${createA.status}: ${JSON.stringify(createA.body).slice(0, 140)}`,
    );
    const createB = await call("POST", "/api/candidates", {
      cookie: admin.cookie,
      body: { name: "Cand B", email: "cand.b@example.io", skills: "SQL", technologies: "Databricks" },
    });
    check(
      "intake B -> 201",
      createB.status === 201,
      `got ${createB.status}: ${JSON.stringify(createB.body).slice(0, 140)}`,
    );
    const dup = await call("POST", "/api/candidates", {
      cookie: admin.cookie,
      body: { name: "Dup", email: "cand.a@example.io" },
    });
    check("duplicate email -> 400", dup.status === 400);
    const noBody = await call("POST", "/api/candidates", { cookie: admin.cookie, raw: "{bad" });
    check("malformed intake JSON -> 400", noBody.status === 400);
    const pool = await call("GET", "/api/candidates", { cookie: admin.cookie });
    const aRec = pool.body.candidates.find((c: any) => c.email === "cand.a@example.io");
    check("admin sees internal compartment", aRec?.internal?.commercialTerms === "rate card X");
    check("candidate codes sequence", pool.body.candidates[0]?.code === "CAND-1001" && pool.body.candidates[1]?.code === "CAND-1002");

    // user for candidate B (A's user was created pre-login? no - create now for A missing)
    await call("POST", "/api/users", { cookie: admin.cookie, body: { name: "Cand B", email: "cand.b@example.io", role: "candidate", password: "cand-pass-123" } });
    const shortPw = await call("POST", "/api/users", { cookie: admin.cookie, body: { name: "X", email: "x@x.io", role: "assessor", password: "short" } });
    check("user create: short password -> 400", shortPw.status === 400);
    const badRole = await call("POST", "/api/users", { cookie: admin.cookie, body: { name: "X", email: "y@x.io", role: "superuser", password: "longenough1" } });
    check("user create: invalid role -> 400", badRole.status === 400);

    // allocation validation
    const users = (await call("GET", "/api/users", { cookie: admin.cookie })).body.users;
    const kavitha = users.find((u: any) => u.email === "kavitha.rao@ecod.io");
    const candA = pool.body.candidates.find((c: any) => c.email === "cand.a@example.io");
    const candB = pool.body.candidates.find((c: any) => c.email === "cand.b@example.io");
    const missingFields = await call("POST", "/api/assessments", { cookie: admin.cookie, body: { candidateId: candA.id } });
    check("assessment create: missing fields -> 400", missingFields.status === 400);
    const badBlueprint = await call("POST", "/api/assessments", {
      cookie: admin.cookie,
      body: { candidateId: candA.id, roleCode: "RSA", blueprintCode: "NOPE", assessorId: kavitha.id },
    });
    check("assessment create: unknown blueprint -> 404", badBlueprint.status === 404);
    const adminAsAssessor = await call("POST", "/api/assessments", {
      cookie: admin.cookie,
      body: { candidateId: candA.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: users.find((u: any) => u.role === "admin").id },
    });
    check("assessment create: admin as assessor -> 400", adminAsAssessor.status === 400);

    const mkA = await call("POST", "/api/assessments", {
      cookie: admin.cookie,
      body: { candidateId: candA.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id },
    });
    check("assessment A created -> 201, candidate in_assessment", mkA.status === 201);
    assessmentAId = mkA.body.assessment.id;
    const mkB = await call("POST", "/api/assessments", {
      cookie: admin.cookie,
      body: { candidateId: candB.id, roleCode: "RSA", blueprintCode: "RSA-STD-V1", assessorId: kavitha.id },
    });
    assessmentBId = mkB.body.assessment?.id ?? "";
    check("assessment B created -> 201", mkB.status === 201);
    const poolNow = await call("GET", "/api/candidates", { cookie: admin.cookie });
    check("candidates moved to in_assessment", poolNow.body.candidates.every((c: any) => c.status === "in_assessment"));

    // cross-tenant GET
    const candBLogin = await login("cand.b@example.io", "cand-pass-123");
    const foreign = await call("GET", `/api/assessments/${assessmentAId}`, { cookie: candBLogin.cookie });
    check("candidate B reading A's assessment -> 403", foreign.status === 403);
    const otherAssessor = await login("marcus.lin@ecod.io", "assess123!");
    const notAllocated = await call("GET", `/api/assessments/${assessmentAId}`, { cookie: otherAssessor.cookie });
    check("non-allocated assessor read -> 403", notAllocated.status === 403);
    const asAssessor = await call("GET", `/api/assessments/${assessmentAId}`, { cookie: assessor.cookie });
    check("assessor read: internal compartment stripped", asAssessor.status === 200 && !("internal" in asAssessor.body.candidate));

    // online: wrong actor, partial, complete, lock
    const asAssessorSubmit = await call("POST", `/api/assessments/${assessmentAId}/online`, {
      cookie: assessor.cookie, body: { answers: [] },
    });
    check("assessor submitting online section -> 403", asAssessorSubmit.status === 403);
    const foreignSubmit = await call("POST", `/api/assessments/${assessmentAId}/online`, {
      cookie: candBLogin.cookie, body: { answers: [] },
    });
    check("candidate B submitting A's online -> 403", foreignSubmit.status === 403);

    const questions = JSON.parse(readFileSync(join(ROOT, "content/questions.json"), "utf8")) as any[];
    const onlineQs = questions.filter((q) => q.delivery === "online");
    const correctAnswers = (over: Record<string, string> = {}) =>
      onlineQs.map((q) => ({ questionCode: q.code, selected: [over[q.code] ?? q.expectedAnswer] }));
    const wrongOne = { [onlineQs[3].code]: "zzz" };

    const partial = await call("POST", `/api/assessments/${assessmentAId}/online`, {
      cookie: candidateA.cookie, body: { answers: correctAnswers(wrongOne).slice(0, 11) },
    });
    check("partial online -> online_in_progress", partial.status === 200 && partial.body.assessment?.status === "online_in_progress");
    const complete = await call("POST", `/api/assessments/${assessmentAId}/online`, {
      cookie: candidateA.cookie, body: { answers: correctAnswers(wrongOne) },
    });
    check(
      "complete online -> online_complete, wrong item scored 0",
      complete.status === 200 &&
        complete.body.assessment?.status === "online_complete" &&
        complete.body.assessment.onlineAnswers.find((a: any) => a.questionCode === onlineQs[3].code)?.autoScore === 0,
    );
    const resubmit = await call("POST", `/api/assessments/${assessmentAId}/online`, {
      cookie: candidateA.cookie, body: { answers: correctAnswers() },
    });
    check("resubmit after completion -> 409 (integrity lock)", resubmit.status === 409);

    // B: perfect run
    const bOnline = await call("POST", `/api/assessments/${assessmentBId}/online`, {
      cookie: candBLogin.cookie, body: { answers: correctAnswers() },
    });
    check("B perfect online -> complete", bOnline.status === 200 && bOnline.body.assessment?.status === "online_complete");

    // scoring guards
    const wrongAssessorScore = await call("POST", `/api/assessments/${assessmentAId}/scoring`, {
      cookie: otherAssessor.cookie, body: { scores: [] },
    });
    check("non-allocated assessor scoring -> 403", wrongAssessorScore.status === 403);
    const rubricQs = questions.filter((q) => q.delivery === "assessor");
    const fullScores = rubricQs.map((q) => ({
      questionCode: q.code,
      criterionScores: Object.fromEntries((q.rubric ?? []).map((c: any) => [c.code, Math.max(...c.levels.map((l: any) => l.score))])),
      evidence: `evidence for ${q.code}`,
    }));
    const incomplete = fullScores.map((s, i) => (i === 3 ? { ...s, criterionScores: {} } : s));
    const incompleteRes = await call("POST", `/api/assessments/${assessmentAId}/scoring`, {
      cookie: assessor.cookie, body: { scores: incomplete },
    });
    check("incomplete criteria -> 400", incompleteRes.status === 400);
    const noEvidence = fullScores.map((s, i) => (i === 4 ? { ...s, evidence: "" } : s));
    const noEvidenceRes = await call("POST", `/api/assessments/${assessmentAId}/scoring`, {
      cookie: assessor.cookie, body: { scores: noEvidence },
    });
    check("case study without evidence -> 400", noEvidenceRes.status === 400);

    // A: mixed scoring (max levels minus one GOV criterion at 0)
    const mixedScores = rubricQs.map((q) => ({
      questionCode: q.code,
      criterionScores: Object.fromEntries(
        (q.rubric ?? []).map((c: any) => [c.code, q.code === "Q-RSA-201" && c.code === "GOV" ? 0 : Math.max(...c.levels.map((l: any) => l.score))]),
      ),
      evidence: `evidence for ${q.code}`,
    }));
    const scoreA = await call("POST", `/api/assessments/${assessmentAId}/scoring`, {
      cookie: assessor.cookie, body: { scores: mixedScores },
    });
    const ra = scoreA.body.assessment?.results;
    check("scoring A -> 200 gap_mapped", scoreA.status === 200 && scoreA.body.assessment?.status === "gap_mapped");
    check(
      "A results invariants (readiness range, 8 competencies, gaps coherent)",
      typeof ra?.readinessScore === "number" &&
        ra.readinessScore >= 0 && ra.readinessScore <= 100 &&
        ra.competencyResults.length === 8 &&
        ra.gaps.every((g: any) => g.gap > 0) &&
        ra.gaps.length + ra.competencyResults.filter((c: any) => c.status === "meets").length === 8,
    );
    check(
      "A: delta competency gapped (liquid-clustering MCQ missed, minor gap)",
      ra?.gaps?.some((g: any) => g.competencyCode === "RSA.DELTA" && g.severity === "minor"),
      `gaps: ${JSON.stringify(ra?.gaps?.map((g: any) => [g.competencyCode, g.severity]))}`,
    );
    const doubleScore = await call("POST", `/api/assessments/${assessmentAId}/scoring`, {
      cookie: assessor.cookie, body: { scores: mixedScores },
    });
    check("double scoring -> 409", doubleScore.status === 409);

    // B: perfect scoring -> exactly 100 / ready
    const scoreB = await call("POST", `/api/assessments/${assessmentBId}/scoring`, {
      cookie: assessor.cookie, body: { scores: fullScores },
    });
    const rb = scoreB.body.assessment?.results;
    check(
      "B perfect run -> readiness 100, no gaps, ready_pending_validation",
      scoreB.status === 200 && rb?.readinessScore === 100 && rb?.gaps?.length === 0 && rb?.outcome === "ready_pending_validation",
      `got readiness ${rb?.readinessScore} gaps ${rb?.gaps?.length} outcome ${rb?.outcome}`,
    );

    // candidate status advanced
    const poolEnd = await call("GET", "/api/candidates", { cookie: admin.cookie });
    check("both candidates gap_mapped", poolEnd.body.candidates.every((c: any) => c.status === "gap_mapped"));

    // recompute
    const recompute = await call("POST", `/api/assessments/${assessmentAId}/recompute`, { cookie: admin.cookie });
    check("admin recompute -> 200 stable", recompute.status === 200 && recompute.body.assessment?.results?.readinessScore === ra?.readinessScore);
    const recomputeAsAssessor = await call("POST", `/api/assessments/${assessmentAId}/recompute`, { cookie: assessor.cookie });
    check("assessor recompute -> 403", recomputeAsAssessor.status === 403);
  }

  /* ---- content guards (mutating; run last) ---- */
  section("content validation over HTTP");
  {
    const roles = (await call("GET", "/api/content/roles", { cookie: admin.cookie })).body.records;
    const mutated = roles.map((r: any) => (r.code === "RSA" ? { ...r, passMark: 65 } : r));
    const save = await call("PUT", "/api/content/roles", { cookie: admin.cookie, body: { records: mutated } });
    const after = (await call("GET", "/api/content/roles", { cookie: admin.cookie })).body.records;
    check("valid content save -> 200 and persisted", save.status === 200 && after.find((r: any) => r.code === "RSA").passMark === 65);
    const invalid = await call("PUT", "/api/content/competencies", {
      cookie: admin.cookie,
      body: { records: [{ id: "x", roleCode: "RSA", code: "BAD", name: "Bad", weight: 1 }] },
    });
    check("competency missing threshold -> 400", invalid.status === 400);
    const notArray = await call("PUT", "/api/content/roles", { cookie: admin.cookie, body: { records: { "nope": 1 } } });
    check("records not an array -> 400", notArray.status === 400);
    const unknown = await call("GET", "/api/content/secrets", { cookie: admin.cookie });
    check("unknown collection -> 404", unknown.status === 404);
    const writeback = readFileSync(join(ROOT, "content/roles.json"), "utf8");
    check("repo content files NOT mutated by tests", JSON.parse(writeback)[0].passMark === 70);
  }

  /* ---- HTML routes & guards ---- */
  section("HTML routes, guards, 404s");
  {
    const anonAdmin = await fetch(`${BASE}/admin`, { redirect: "manual" });
    check("anonymous /admin redirects to login", anonAdmin.status === 307 && (anonAdmin.headers.get("location") ?? "").includes("/login"));
    const assessorToAdmin = await fetch(`${BASE}/admin`, { redirect: "manual", headers: { Cookie: assessor.cookie } });
    check("assessor /admin redirects to own home", assessorToAdmin.status === 307 && (assessorToAdmin.headers.get("location") ?? "").includes("/assessor"));
    const adminPage = await fetch(`${BASE}/admin`, { headers: { Cookie: admin.cookie } });
    const adminHtml = await adminPage.text();
    check("admin dashboard renders", adminPage.status === 200 && adminHtml.includes("Talent pipeline"));
    const assessorPage = await fetch(`${BASE}/assessor`, { headers: { Cookie: assessor.cookie } });
    const assessorHtml = await assessorPage.text();
    check("assessor workspace renders scoped list", assessorPage.status === 200 && assessorHtml.includes("My assessments"));
    const candPage = await fetch(`${BASE}/candidate`, { headers: { Cookie: candidateA.cookie } });
    const candHtml = await candPage.text();
    check("candidate portal renders results after scoring", candPage.status === 200 && candHtml.includes("Your ECOD journey"));
    const notFoundPage = await fetch(`${BASE}/definitely-not-a-route`);
    check("unknown page -> 404", notFoundPage.status === 404);
    const notFoundApi = await call("GET", "/api/assessments/asmt_does-not-exist", { cookie: admin.cookie });
    check("unknown assessment id -> 404", notFoundApi.status === 404);
  }

  /* ---- concurrency smoke ---- */
  section("concurrency smoke");
  {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => call("GET", "/api/assessments", { cookie: admin.cookie })),
    );
    check("25 parallel API reads all -> 200", results.every((r) => r.status === 200));
    const pages = await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/login`)));
    check("10 parallel page loads all -> 200", pages.every((p) => p.status === 200));
  }

  /* ---- summary ---- */
  console.log(`\n${"─".repeat(60)}\nAPI suite: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("suite crashed:", err, "\nserver log:\n" + serverLog.slice(-2000));
    process.exitCode = 1;
  })
  .finally(() => {
    // kill the whole detached group (npx spawns next-server as a grandchild)
    try {
      if (server.pid) process.kill(-server.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    server.kill("SIGKILL");
    // force exit: open stdio pipes to the dead server would otherwise keep the loop alive
    process.exit(process.exitCode ?? 0);
  });
