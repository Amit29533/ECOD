import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { recomputeAssessment } from "@/lib/services";

/** Admin: idempotently re-run the scoring engine (e.g. after content edits). */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async (user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    const assessment = await recomputeAssessment(id);
    return NextResponse.json({ assessment });
  });
}
