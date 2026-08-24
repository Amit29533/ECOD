import { NextResponse } from "next/server";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { ensureSeeded, findUserByEmail } from "@/lib/services";
import { roleHome } from "@/domain/rbac";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  await ensureSeeded();
  const body = await request.json().catch(() => null);
  const { email, password } = (body ?? {}) as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  // brute-force throttle per email+client (in-memory, single instance)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const max = Number(process.env.ECOD_LOGIN_MAX ?? 10);
  const { allowed, retryAfterSec } = rateLimit(`login|${ip}|${email.toLowerCase()}`, Number.isFinite(max) ? max : 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  const user = await findUserByEmail(email);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true, redirectTo: roleHome(user) });
}
