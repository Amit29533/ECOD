import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { submitAssessorScores } from "@/lib/services";

/** Assessor submits rubric scores; scoring engine computes results + gaps. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async (user) => {
    const body = await request.json();
    const scores = Array.isArray(body?.scores) ? body.scores : [];
    const assessment = await submitAssessorScores(user, id, scores);
    return NextResponse.json({ assessment });
  });
}
