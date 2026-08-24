"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";

export function AddUserForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create user.");
      return;
    }
    setOk(`${data.user.name} created as ${data.user.role}.`);
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Name">
          <input name="name" className="input" required placeholder="Dr. New Assessor" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" className="input" required placeholder="name@ecod.io" />
        </Field>
        <Field label="Role">
          <select name="role" className="input" defaultValue="assessor">
            <option value="assessor">Assessor</option>
            <option value="admin">Admin</option>
            <option value="candidate">Candidate</option>
          </select>
        </Field>
        <Field label="Password" hint="Min 8 characters">
          <input name="password" type="password" className="input" required minLength={8} placeholder="••••••••" />
        </Field>
      </div>
      <Field label="Title (optional)">
        <input name="title" className="input" placeholder="Principal Assessor — Databricks" />
      </Field>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{ok}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}
