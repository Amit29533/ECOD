import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { createAssessment, listAssessmentsFor } from "@/lib/services";

export async function GET() {
  return withUser(async (user) => {
    // scoped by role inside the service (admin: all; assessor: allocated; candidate: own)
    const assessments = await listAssessmentsFor(user);
    return NextResponse.json({ assessments });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    const body = await request.json();
    const { candidateId, roleCode, blueprintCode, assessorId } = body ?? {};
    if (!candidateId || !roleCode || !blueprintCode || !assessorId) {
      return NextResponse.json(
        { error: "candidateId, roleCode, blueprintCode and assessorId are required." },
        { status: 400 },
      );
    }
    const assessment = await createAssessment({ candidateId, roleCode, blueprintCode, assessorId });
    return NextResponse.json({ assessment }, { status: 201 });
  });
}
