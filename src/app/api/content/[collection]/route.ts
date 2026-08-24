import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { getContent, saveContent } from "@/lib/services";
import type { ContentCollection } from "@/domain/types";

const VALID: ContentCollection[] = ["roles", "competencies", "questions", "blueprints", "enrichment"];

export async function GET(_request: Request, ctx: { params: Promise<{ collection: string }> }) {
  const { collection } = await ctx.params;
  return withUser(async (user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    if (!VALID.includes(collection as ContentCollection)) {
      return NextResponse.json({ error: "Unknown content collection." }, { status: 404 });
    }
    return NextResponse.json({ records: await getContent(collection as ContentCollection) });
  });
}

export async function PUT(request: Request, ctx: { params: Promise<{ collection: string }> }) {
  const { collection } = await ctx.params;
  return withUser(async (user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    if (!VALID.includes(collection as ContentCollection)) {
      return NextResponse.json({ error: "Unknown content collection." }, { status: 404 });
    }
    const body = await request.json();
    const records = body?.records;
    if (!Array.isArray(records)) return NextResponse.json({ error: "`records` must be an array." }, { status: 400 });
    await saveContent(collection as ContentCollection, records);
    return NextResponse.json({ ok: true, count: records.length });
  });
}
