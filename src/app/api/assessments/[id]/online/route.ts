import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/api";
import { submitOnlineAnswers } from "@/lib/services";

/** Candidate submits online (auto-scored) answers. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser(async (user) => {
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    const answers = Array.isArray(body?.answers) ? body.answers : [];
    const assessment = await submitOnlineAnswers(user, id, answers);
    return NextResponse.json({ assessment });
  });
}
