import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { getAssessmentView } from "@/lib/services";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async (user) => {
    const view = await getAssessmentView(user, id);
    if (!view) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
    return NextResponse.json({ assessment: view.assessment, candidate: view.candidate });
  });
}
