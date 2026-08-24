"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

interface Item {
  code: string;
  prompt: string;
  options: { id: string; text: string }[];
  selected: string[];
}

export function OnlineAssessmentForm({ assessmentId, questions }: { assessmentId: string; questions: Item[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.code] = q.selected[0] ?? "";
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answered = Object.values(answers).filter(Boolean).length;
  const allAnswered = answered === questions.length;

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = questions.map((q) => ({ questionCode: q.code, selected: answers[q.code] ? [answers[q.code]] : [] }));
    const res = await fetch(`/api/assessments/${assessmentId}/online`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Submission failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <Card key={q.code}>
          <fieldset>
            <legend className="text-sm font-semibold leading-relaxed text-slate-800">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                {i + 1}
              </span>
              {q.prompt}
            </legend>
            <div className="mt-3 space-y-2">
              {q.options.map((o) => {
                const chosen = answers[q.code] === o.id;
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                      chosen ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.code}
                      className="mt-0.5"
                      checked={chosen}
                      onChange={() => setAnswers((a) => ({ ...a, [q.code]: o.id }))}
                    />
                    <span className="text-slate-700">{o.text}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Card>
      ))}

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-xs font-semibold text-slate-500">
          {answered}/{questions.length} answered
        </p>
        <button className="btn-primary" disabled={busy || !allAnswered} onClick={submit}>
          {busy ? "Submitting…" : allAnswered ? "Submit answers" : "Answer all questions to submit"}
        </button>
      </div>
    </div>
  );
}
