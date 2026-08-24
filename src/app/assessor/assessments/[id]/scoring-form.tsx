"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

interface RubricCriterionView {
  code: string;
  label: string;
  competencyCode?: string;
  weight?: number;
  levels: { score: number; label: string; descriptor: string }[];
}

interface QuestionView {
  code: string;
  type: string;
  prompt: string;
  context?: string;
  expectedAnswer?: string;
  expectedEvidence?: string;
  rubric: RubricCriterionView[];
}

interface SectionView {
  id: string;
  name: string;
  instructions: string;
  questions: QuestionView[];
}

export function ScoringForm({
  assessmentId,
  sections,
  disabled,
  statusNote,
}: {
  assessmentId: string;
  sections: SectionView[];
  disabled: boolean;
  statusNote?: string;
}) {
  const router = useRouter();
  const allQuestions = useMemo(() => sections.flatMap((s) => s.questions), [sections]);
  const initial = useMemo(() => {
    const state: Record<string, { criteria: Record<string, number>; evidence: string }> = {};
    for (const q of allQuestions) state[q.code] = { criteria: {}, evidence: "" };
    return state;
  }, [allQuestions]);

  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(questionCode: string, criterionCode: string, score: number) {
    setState((s) => ({
      ...s,
      [questionCode]: { ...s[questionCode], criteria: { ...s[questionCode].criteria, [criterionCode]: score } },
    }));
  }

  function setEvidence(questionCode: string, evidence: string) {
    setState((s) => ({ ...s, [questionCode]: { ...s[questionCode], evidence } }));
  }

  function itemScore(q: QuestionView, criteria: Record<string, number>): number | null {
    if (q.rubric.length === 0) return null;
    let total = 0;
    let totalW = 0;
    for (const c of q.rubric) {
      const v = criteria[c.code];
      if (v === undefined) continue;
      const w = c.weight ?? 1;
      total += v * w;
      totalW += w;
    }
    return totalW === 0 ? null : Math.round(total / totalW);
  }

  function completeness(): { ready: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const q of allQuestions) {
      const st = state[q.code];
      const allCriteria = q.rubric.every((c) => st.criteria[c.code] !== undefined);
      const evidenceOk = q.type !== "case-study" || st.evidence.trim().length > 0;
      if (!allCriteria || !evidenceOk) missing.push(q.code);
    }
    return { ready: missing.length === 0, missing };
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const scores = allQuestions.map((q) => ({
      questionCode: q.code,
      criterionScores: state[q.code].criteria,
      evidence: state[q.code].evidence || undefined,
    }));
    const res = await fetch(`/api/assessments/${assessmentId}/scoring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Submission failed.");
      return;
    }
    router.refresh();
  }

  const { ready, missing } = completeness();

  return (
    <div className="space-y-6">
      {statusNote && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{statusNote}</p>}

      {sections.map((section) => (
        <div key={section.id} className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{section.name}</h2>
            <p className="text-xs text-slate-500">{section.instructions}</p>
          </div>
          {section.questions.map((q) => {
            const st = state[q.code];
            const score = itemScore(q, st.criteria);
            return (
              <Card key={q.code}>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-400">{q.code}</p>
                      <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-800">{q.prompt}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${score === null ? "text-slate-300" : "text-indigo-600"}`}>
                        {score ?? "—"}
                      </p>
                      <p className="text-[10px] font-semibold uppercase text-slate-400">item score</p>
                    </div>
                  </div>

                  {q.context && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
                      <span className="font-bold">Scenario:</span> {q.context}
                    </p>
                  )}

                  {(q.expectedAnswer || q.expectedEvidence) && (
                    <details className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-bold text-indigo-700">Scoring guide (expected answer / evidence)</summary>
                      <div className="mt-2 space-y-2 text-xs leading-relaxed text-indigo-900">
                        {q.expectedAnswer && <p>{q.expectedAnswer}</p>}
                        {q.expectedEvidence && (
                          <p>
                            <span className="font-bold">Look for:</span> {q.expectedEvidence}
                          </p>
                        )}
                      </div>
                    </details>
                  )}

                  <div className="space-y-3">
                    {q.rubric.map((c) => (
                      <div key={c.code} className="rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between px-3 py-2">
                          <p className="text-xs font-bold text-slate-700">
                            {c.label}
                            {c.competencyCode && <span className="ml-2 font-mono text-[10px] font-normal text-slate-400">{c.competencyCode}</span>}
                          </p>
                        </div>
                        <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
                          {c.levels.map((lvl) => {
                            const chosen = st.criteria[c.code] === lvl.score;
                            return (
                              <button
                                key={lvl.score}
                                type="button"
                                onClick={() => pick(q.code, c.code, lvl.score)}
                                className={`rounded-lg border p-2.5 text-left transition ${
                                  chosen
                                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                                    : "border-slate-200 bg-white hover:border-indigo-300"
                                }`}
                              >
                                <span className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800">{lvl.label}</span>
                                  <span className={`text-xs font-black ${chosen ? "text-indigo-600" : "text-slate-400"}`}>{lvl.score}</span>
                                </span>
                                <span className="mt-1 block text-[11px] leading-snug text-slate-500">{lvl.descriptor}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="label">
                      Evidence {q.type === "case-study" ? "(required)" : "(optional notes)"}
                    </label>
                    <textarea
                      className="input min-h-16"
                      placeholder="What the candidate said/did that justifies these levels…"
                      value={st.evidence}
                      onChange={(e) => setEvidence(q.code, e.target.value)}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
      {!ready && !disabled && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-xs text-slate-500">
          Remaining before submit: {missing.map((m) => (
            <span key={m} className="mr-2 font-mono">
              {m}
              {state[m]?.evidence?.trim() ? "" : ""}
            </span>
          ))}
        </p>
      )}

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="mr-auto text-xs text-slate-500">
          Submitting runs the scoring engine: competency scores, readiness, outcome and the capability gap map are generated automatically.
        </p>
        <button className="btn-primary" disabled={busy || disabled || !ready} onClick={submit}>
          {busy ? "Scoring…" : "Submit scores & generate gaps"}
        </button>
      </div>
    </div>
  );
}
