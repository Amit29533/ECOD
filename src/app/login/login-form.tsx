"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@ecod.io", password: "admin123!" },
  { label: "Assessor (Kavitha)", email: "kavitha.rao@ecod.io", password: "assess123!" },
  { label: "Assessor (Marcus)", email: "marcus.lin@ecod.io", password: "assess123!" },
  { label: "Candidate (Arjun — assessment waiting)", email: "arjun.mehta@example.io", password: "cand123!" },
  { label: "Candidate (Priya — completed)", email: "priya.nair@example.io", password: "cand123!" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Sign-in failed");
      setBusy(false);
      return;
    }
    router.push(data.redirectTo ?? "/");
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@ecod.io"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts (click to fill)</p>
        <div className="space-y-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50"
              onClick={() => {
                setEmail(a.email);
                setPassword(a.password);
              }}
            >
              <span className="font-semibold text-slate-800">{a.label}</span>
              <span className="block text-slate-500">
                {a.email} · {a.password}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
