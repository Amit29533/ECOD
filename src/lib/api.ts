import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import type { User } from "@/domain/types";
import { ServiceError } from "./services";

/** Guard helper for route handlers: returns user or a 401 response. */
export async function withUser(
  handler: (user: User) => Promise<NextResponse>,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    return await handler(user);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api]", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
