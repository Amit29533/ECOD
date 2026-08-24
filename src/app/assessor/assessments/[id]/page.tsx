import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAssessmentView } from "@/lib/services";
import { Badge, Card, ResultsView, fmtDate } from "@/components/ui";
import { ScoringForm } from "./scoring-form";
import type { Question } from "@/domain/types";

export default async function AssessorAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("assessor");
  const { id } = await params;
  let view;
  try {
    view = await getAssessmentView(user, id);
  } catch {
    notFound();
  }
  if (!view) notFound();
  const { assessment, candidate, role, blueprint, questions } = view;
  const questionsByCode = new Map<string, Question>(questions.map((q) => [q.code, q]));
  const onlineSection = blueprint?.sections.find((s) => s.delivery === "online");
  const assessorSections = blueprint?.sections.filter((s) => s.delivery === "assessor") ?? [];
  const scored = ["scored", "gap_mapped"].includes(assessment.status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {assessment.code} — {candidate.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {role?.title ?? assessment.roleCode} · {blueprint?.name ?? assessment.blueprintCode} · allocated to you{" "}
          {fmtDate(assessment.allocatedAt)}
        </p>
      </div>

      <Card title="Candidate brief" subtitle="Professional profile only — commercials and client data are restricted to administrators.">
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <Info label="Current role" value={candidate.currentRole} />
          <Info label="Experience" value={candidate.yearsExperience ? `${candidate.yearsExperience} years` : "—"} />
          <Info label="Location / TZ" value={[candidate.location, candidate.timezone].filter(Boolean).join(" · ")} />
        </div>
        {candidate.cvSummary && <p className="mt-3 text-sm leading-relaxed text-slate-600">{candidate.cvSummary}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...candidate.technologies, ...candidate.skills].map((s) => (
            <Badge key={s} tone="blue">
              {s}
            </Badge>
          ))}
        </div>
      </Card>

      {scored && assessment.results ? (
        <>
          <Card title="Final results" subtitle="Your scoring produced this outcome automatically (scoring engine v1).">
            <ResultsView results={assessment.results} />
          </Card>
          <Card title="Your scores" subtitle="Submitted rubric decisions with evidence.">
            {assessment.assessorScores.map((s) => {
              const q = questionsByCode.get(s.questionCode);
              return (
                <div key={s.questionCode} className="border-b border-slate-100 py-3 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">{s.questionCode}</span>
                    <span className="text-sm font-bold text-slate-800">{s.itemScore}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{q?.prompt}</p>
                  {s.evidence && <p className="mt-1 text-xs italic text-slate-500">Evidence: {s.evidence}</p>}
                </div>
              );
            })}
          </Card>
        </>
      ) : (
        <>
          <Card
            title="Section A — candidate's auto-scored results"
            subtitle="For context while you score the deep-dive and case study sections."
          >
            {assessment.onlineAnswers.length === 0 ? (
              <p className="text-sm text-slate-500">Candidate has not submitted yet — you can preview the questions below.</p>
            ) : (
              <div className="space-y-2">
                {onlineSection?.questionCodes.map((code) => {
                  const q = questionsByCode.get(code);
                  const a = assessment.onlineAnswers.find((x) => x.questionCode === code);
                  if (!q) return null;
                  return (
                    <div key={code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="min-w-48 flex-1 truncate text-sm text-slate-700">
                        <span className="font-mono text-xs text-slate-400">{code}</span> {q.prompt}
                      </span>
                      <Badge tone={a?.correct ? "green" : "red"}>{a?.autoScore ?? 0}/100</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <ScoringForm
            assessmentId={assessment.id}
            disabled={!["online_complete", "assessor_scoring"].includes(assessment.status)}
            statusNote={
              assessment.status === "allocated" || assessment.status === "online_in_progress"
                ? "Scoring unlocks once the candidate submits the online section."
                : undefined
            }
            sections={assessorSections.map((section) => ({
              id: section.id,
              name: section.name,
              instructions: section.instructions,
              questions: section.questionCodes
                .map((code) => questionsByCode.get(code))
                .filter((q): q is Question => Boolean(q))
                .map((q) => ({
                  code: q.code,
                  type: q.type,
                  prompt: q.prompt,
                  context: q.context,
                  expectedAnswer: q.expectedAnswer,
                  expectedEvidence: q.expectedEvidence,
                  rubric: q.rubric ?? [],
                })),
            }))}
          />
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-700">{value?.trim() ? value : "—"}</p>
    </div>
  );
}
