import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAssessmentView, listUsers } from "@/lib/services";
import type { Question } from "@/domain/types";
import {
  ASSESSMENT_STEPS,
} from "@/domain/workflow";
import {
  AssessmentStatusPill,
  Badge,
  Card,
  ResultsView,
  ScoreBar,
  Stepper,
  fmtDate,
} from "@/components/ui";
import { RecomputeButton } from "./recompute-button";

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser("admin");
  const { id } = await params;
  let view;
  try {
    view = await getAssessmentView(admin, id);
  } catch {
    notFound();
  }
  if (!view) notFound();
  const { assessment, candidate, role, blueprint, questions } = view;
  const users = await listUsers();
  const assessor = users.find((u) => u.id === assessment.assessorId);
  const questionsByCode = new Map<string, Question>(questions.map((q) => [q.code, q]));

  const onlineSection = blueprint?.sections.find((s) => s.delivery === "online");
  const assessorSections = blueprint?.sections.filter((s) => s.delivery === "assessor") ?? [];
  const answersByCode = new Map(assessment.onlineAnswers.map((a) => [a.questionCode, a]));
  const scoresByCode = new Map(assessment.assessorScores.map((s) => [s.questionCode, s]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{assessment.code}</h1>
            <AssessmentStatusPill status={assessment.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <Link href={`/admin/candidates/${candidate.id}`} className="font-semibold text-indigo-600 hover:underline">
              {candidate.name}
            </Link>{" "}
            · {role?.title ?? assessment.roleCode} · {blueprint?.name ?? assessment.blueprintCode} · Assessor:{" "}
            {assessor?.name ?? "—"}
          </p>
        </div>
        <div className="flex gap-2">
          {assessment.results && <RecomputeButton assessmentId={assessment.id} />}
          <Link href="/admin/assessments" className="btn-secondary">
            ← All
          </Link>
        </div>
      </div>

      <Card title="Progress">
        <Stepper steps={ASSESSMENT_STEPS.map((s) => ({ key: s.status, label: s.label }))} current={assessment.status} />
        <p className="mt-3 text-xs text-slate-500">
          Allocated {fmtDate(assessment.allocatedAt)} · Online completed {fmtDate(assessment.onlineCompletedAt)} · Last update{" "}
          {fmtDate(assessment.updatedAt)}
        </p>
      </Card>

      {assessment.results && (
        <Card title="Results & capability gaps" subtitle="Produced automatically by the scoring engine when the assessor submits.">
          <ResultsView results={assessment.results} />
        </Card>
      )}

      <Card
        title={`Section A — Knowledge check (online, auto-scored)`}
        subtitle={onlineSection ? `${onlineSection.questionCodes.length} questions · weight ${onlineSection.weight}%` : "No online section"}
      >
        {assessment.onlineAnswers.length === 0 ? (
          <p className="text-sm text-slate-500">Candidate has not submitted the online section yet.</p>
        ) : (
          <div className="space-y-3">
            {onlineSection?.questionCodes.map((code) => {
              const q = questionsByCode.get(code);
              const a = answersByCode.get(code);
              if (!q) return null;
              const correct = a?.correct;
              const selectedText =
                a?.selected
                  .map((sid) => q.options?.find((o) => o.id === sid)?.text ?? sid)
                  .join(", ") || "—";
              const correctText = q.options?.find((o) => o.id === q.expectedAnswer)?.text ?? "—";
              return (
                <details key={code} className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className="font-mono text-xs text-slate-400">{code}</span>
                    <span className="flex-1 min-w-48 truncate">{q.prompt}</span>
                    <Badge tone={correct ? "green" : "red"}>{a?.autoScore ?? 0}</Badge>
                  </summary>
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold">Selected:</span> {selectedText}
                    </p>
                    <p>
                      <span className="font-semibold">Correct:</span> {correctText}
                    </p>
                    {q.explanation && (
                      <p className="rounded bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">{q.explanation}</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>

      {assessorSections.map((section) => (
        <Card key={section.id} title={section.name} subtitle={`${section.questionCodes.length} rubric-scored items · weight ${section.weight}%`}>
          <div className="space-y-4">
            {section.questionCodes.map((code) => {
              const q = questionsByCode.get(code);
              const s = scoresByCode.get(code);
              if (!q) return null;
              return (
                <div key={code} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-400">{code}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{q.prompt}</p>
                    </div>
                    {s?.itemScore !== undefined && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900">{s.itemScore}</p>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">item score</p>
                      </div>
                    )}
                  </div>
                  {q.rubric && s && (
                    <div className="mt-3 space-y-2">
                      {q.rubric.map((c) => {
                        const chosen = c.levels.find((l) => l.score === s.criterionScores[c.code]);
                        return (
                          <div key={c.code} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2">
                            <span className="text-xs font-semibold text-slate-600">{c.label}</span>
                            <span className="flex items-center gap-2">
                              {chosen && <Badge tone={chosen.score >= 70 ? "green" : chosen.score >= 40 ? "amber" : "red"}>{chosen.label}</Badge>}
                              <span className="text-sm font-bold text-slate-700">{s.criterionScores[c.code] ?? "—"}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {s?.evidence && (
                    <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                      <span className="font-bold">Assessor evidence:</span> {s.evidence}
                    </p>
                  )}
                  {!s && <p className="mt-3 text-xs font-semibold text-amber-600">Awaiting assessor scoring.</p>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
