import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAssessmentView } from "@/lib/services";
import { Card } from "@/components/ui";
import { OnlineAssessmentForm } from "./online-form";
import type { Question } from "@/domain/types";

export default async function CandidateAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("candidate");
  const { id } = await params;
  let view;
  try {
    view = await getAssessmentView(user, id);
  } catch {
    notFound();
  }
  if (!view) notFound();
  const { assessment, blueprint, questions } = view;
  if (!view.viewerIsOwnerCandidate) redirect("/candidate");

  const onlineSection = blueprint?.sections.find((s) => s.delivery === "online");
  if (!onlineSection) redirect("/candidate");
  const questionsByCode = new Map<string, Question>(questions.map((q) => [q.code, q]));
  const items = onlineSection.questionCodes
    .map((code) => questionsByCode.get(code))
    .filter((q): q is Question => Boolean(q));

  const submitted = ["online_complete", "assessor_scoring", "scored", "gap_mapped"].includes(assessment.status);
  const previous = new Map(assessment.onlineAnswers.map((a) => [a.questionCode, a]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Knowledge check</h1>
        <p className="text-sm text-slate-500">{blueprint?.name} — Section A of your RSA assessment.</p>
      </div>

      {submitted ? (
        <Card title="Submitted">
          <p className="text-sm text-slate-600">
            Thank you — your knowledge check has been submitted and auto-scored. The next stage is the assessor-led deep-dive and
            case study review. Your full results will appear on your journey page once scoring is complete.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Instructions">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>{onlineSection.instructions}</li>
              <li>{items.length} multiple-choice questions — answer every question.</li>
              <li>One submission: you can review your answers before submitting.</li>
            </ul>
          </Card>
          <OnlineAssessmentForm
            assessmentId={assessment.id}
            questions={items.map((q) => ({
              code: q.code,
              prompt: q.prompt,
              options: q.options ?? [],
              selected: previous.get(q.code)?.selected ?? [],
            }))}
          />
        </>
      )}
    </div>
  );
}
