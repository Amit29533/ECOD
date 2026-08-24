"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Field } from "@/components/ui";

export function StartAssessmentForm({
  candidateId,
  blueprints,
  assessors,
}: {
  candidateId: string;
  blueprints: { code: string; name: string; roleCode: string }[];
  assessors: { id: string; name: string; title?: string }[];
}) {
  const router = useRouter();
  const [blueprintCode, setBlueprintCode] = useState(blueprints[0]?.code ?? "");
  const [assessorId, setAssessorId] = useState(assessors[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const blueprint = useMemo(() => blueprints.find((b) => b.code === blueprintCode), [blueprintCode, blueprints]);

  if (blueprints.length === 0 || assessors.length === 0) {
    return <p className="text-sm text-slate-500">Needs at least one active blueprint and one active assessor (configure in Domain content / Users).</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, roleCode: blueprint?.roleCode, blueprintCode, assessorId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create assessment.");
      return;
    }
    setOk(`Created ${data.assessment.code} and allocated the assessor.`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assessment blueprint" hint={blueprint ? `Role track: ${blueprint.roleCode}` : undefined}>
          <select className="input" value={blueprintCode} onChange={(e) => setBlueprintCode(e.target.value)}>
            {blueprints.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Allocate assessor">
          <select className="input" value={assessorId} onChange={(e) => setAssessorId(e.target.value)}>
            {assessors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.title ? ` — ${a.title}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{ok}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create assessment & allocate"}
        </button>
      </div>
    </form>
  );
}
