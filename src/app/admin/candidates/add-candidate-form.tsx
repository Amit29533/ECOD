"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/ui";

export function AddCandidateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch("/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save candidate.");
      return;
    }
    setOk(`${data.candidate.name} added as ${data.candidate.code} (status: intake).`);
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Full name">
          <input name="name" className="input" required placeholder="Jane Doe" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" className="input" required placeholder="jane@example.io" />
        </Field>
        <Field label="Phone">
          <input name="phone" className="input" placeholder="+91 …" />
        </Field>
        <Field label="Location">
          <input name="location" className="input" placeholder="Bengaluru, India" />
        </Field>
        <Field label="Current role">
          <input name="currentRole" className="input" placeholder="Senior Data Engineer" />
        </Field>
        <Field label="Years experience">
          <input name="yearsExperience" type="number" min={0} max={50} className="input" placeholder="8" />
        </Field>
        <Field label="Skills (comma-separated)">
          <input name="skills" className="input" placeholder="PySpark, SQL, Airflow" />
        </Field>
        <Field label="Technologies (comma-separated)">
          <input name="technologies" className="input" placeholder="Databricks, AWS, Delta Lake" />
        </Field>
        <Field label="Source">
          <input name="source" className="input" placeholder="Referral, inbound, partner…" />
        </Field>
      </div>
      <Field label="CV summary / notes">
        <textarea name="cvSummary" className="input min-h-20" placeholder="Short professional summary from screening call…" />
      </Field>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-700">Internal — admin compartment only</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Commercial terms">
            <input name="internalCommercialTerms" className="input" placeholder="Rate card, margin…" />
          </Field>
          <Field label="Client / pipeline notes">
            <input name="internalClientNotes" className="input" placeholder="Potential client allocations…" />
          </Field>
          <Field label="Rating">
            <input name="internalRating" className="input" placeholder="A / B+ / …" />
          </Field>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{ok}</p>}

      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Add candidate"}
        </button>
      </div>
    </form>
  );
}
