import { NextResponse } from "next/server";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { ensureSeeded, findUserByEmail } from "@/lib/services";
import { roleHome } from "@/domain/rbac";

export async function POST(request: Request) {
  await ensureSeeded();
  const { email, password } = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  const user = await findUserByEmail(email);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true, redirectTo: roleHome(user) });
}
