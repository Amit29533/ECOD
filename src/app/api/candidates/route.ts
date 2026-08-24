import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { createCandidate, listCandidates } from "@/lib/services";

export async function GET() {
  return withUser(async (user) => {
    const candidates = await listCandidates(user);
    return NextResponse.json({ candidates });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    const body = await request.json();
    if (!body?.name || !body?.email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    const candidate = await createCandidate({
      name: String(body.name),
      email: String(body.email),
      phone: body.phone,
      location: body.location,
      timezone: body.timezone,
      currentRole: body.currentRole,
      yearsExperience: body.yearsExperience ? Number(body.yearsExperience) : undefined,
      linkedinUrl: body.linkedinUrl,
      cvSummary: body.cvSummary,
      skills: splitCsv(body.skills),
      technologies: splitCsv(body.technologies),
      source: body.source,
      intakeNotes: body.intakeNotes,
      internal: body.internalCommercialTerms || body.internalClientNotes || body.internalRating
        ? {
            commercialTerms: body.internalCommercialTerms,
            clientNotes: body.internalClientNotes,
            rating: body.internalRating,
          }
        : undefined,
    });
    return NextResponse.json({ candidate }, { status: 201 });
  });
}

function splitCsv(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
