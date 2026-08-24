import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { revokeUserSessions } from "@/lib/services";

export async function POST() {
  // Stateless tokens live until expiry - logout must also revoke server-side,
  // otherwise a copied cookie would keep working after "sign out".
  const user = await getCurrentUser();
  if (user) await revokeUserSessions(user.id);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
