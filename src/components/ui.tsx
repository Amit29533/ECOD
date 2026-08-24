import type {
  Assessment,
  AssessmentResults,
  Candidate,
  User,
} from "@/domain/types";
import {
  ASSESSMENT_STEPS,
  CANDIDATE_JOURNEY_LABELS,
} from "@/domain/workflow";
import { ROLE_LABELS } from "@/domain/rbac";

/* ---------------------------------------------------------------- */
/* Generic building blocks                                           */
/* ---------------------------------------------------------------- */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-bold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="card-pad">{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone] ?? TONES.slate}`}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card card-pad">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/* ---------------------------------------------------------------- */
/* Domain-specific display components                                */
/* ---------------------------------------------------------------- */

const CANDIDATE_STATUS_TONES: Record<string, string> = {
  intake: "slate",
  role_mapped: "blue",
  in_assessment: "violet",
  assessed: "amber",
  gap_mapped: "amber",
  enrichment_planned: "blue",
  enriching: "blue",
  validation: "blue",
  enterprise_ready: "green",
  on_hold: "slate",
  rejected: "red",
};

export function CandidateStatusPill({ status }: { status: Candidate["status"] }) {
  return <Badge tone={CANDIDATE_STATUS_TONES[status] ?? "slate"}>{CANDIDATE_JOURNEY_LABELS[status] ?? status}</Badge>;
}

const ASSESSMENT_STATUS_TONES: Record<string, string> = {
  allocated: "slate",
  online_in_progress: "blue",
  online_complete: "blue",
  assessor_scoring: "violet",
  scored: "amber",
  gap_mapped: "green",
};

export function AssessmentStatusPill({ status }: { status: Assessment["status"] }) {
  const label = ASSESSMENT_STEPS.find((s) => s.status === status)?.label ?? status;
  return <Badge tone={ASSESSMENT_STATUS_TONES[status] ?? "slate"}>{label}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: AssessmentResults["outcome"] }) {
  const map: Record<AssessmentResults["outcome"], { tone: string; label: string }> = {
    ready_pending_validation: { tone: "green", label: "Ready — pending independent validation" },
    enrichment_required: { tone: "amber", label: "Enrichment required before validation" },
    not_ready: { tone: "red", label: "Not ready — substantial gaps" },
  };
  const { tone, label } = map[outcome];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ScoreBar({ score, threshold }: { score: number; threshold?: number }) {
  const tone = threshold === undefined ? "bg-indigo-500" : score >= threshold ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="relative h-2.5 w-full min-w-28 overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      {threshold !== undefined && threshold > 0 && (
        <div
          className="absolute top-[-2px] h-[14px] w-[2px] bg-slate-900/70"
          style={{ left: `calc(${threshold}% - 1px)` }}
          title={`Required: ${threshold}`}
        />
      )}
    </div>
  );
}

export function Stepper({ steps, current }: { steps: { key: string; label: string }[]; current: string }) {
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "active" : "todo";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                state === "done"
                  ? "bg-emerald-500 text-white"
                  : state === "active"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className={`text-xs font-semibold ${state === "todo" ? "text-slate-400" : "text-slate-700"}`}>{s.label}</span>
            {i < steps.length - 1 && <span className="h-px w-4 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- */
/* Results panel (shared by admin / assessor / candidate views)      */
/* ---------------------------------------------------------------- */

const SEVERITY_TONES: Record<string, string> = { minor: "amber", major: "amber", critical: "red" };

export function ResultsView({ results }: { results: AssessmentResults }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-indigo-600 text-white">
            <span className="text-2xl font-bold leading-none">{results.readinessScore}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">readiness</span>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pass mark {results.passMark}</p>
            <OutcomeBadge outcome={results.outcome} />
          </div>
        </div>
        <p className="max-w-xl text-sm text-slate-600">{results.summary}</p>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Competency scores vs required thresholds</h3>
        <div className="space-y-3">
          {results.competencyResults
            .slice()
            .sort((a, b) => a.weight - b.weight)
            .map((c) => (
              <div key={c.competencyCode} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-12 min-w-0 sm:col-span-5">
                  <p className="truncate text-sm font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    weight {c.weight}% · required {c.threshold}
                    {c.status === "not_assessed" && " · not assessed"}
                  </p>
                </div>
                <div className="col-span-9 sm:col-span-5">
                  <ScoreBar score={c.score} threshold={c.threshold} />
                </div>
                <div className="col-span-3 text-right sm:col-span-2">
                  <span className={`text-sm font-bold ${c.status === "meets" ? "text-emerald-600" : "text-amber-600"}`}>
                    {c.score}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {results.gaps.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Capability gaps &amp; recommended enrichment</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Competency</th>
                  <th className="th">Score / Required</th>
                  <th className="th">Gap</th>
                  <th className="th">Severity</th>
                  <th className="th">Recommended enrichment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {results.gaps.map((g) => (
                  <tr key={g.competencyCode}>
                    <td className="td font-semibold text-slate-800">{g.name}</td>
                    <td className="td">
                      {g.score} / {g.threshold}
                    </td>
                    <td className="td">-{g.gap}</td>
                    <td className="td">
                      <Badge tone={SEVERITY_TONES[g.severity]}>{g.severity}</Badge>
                    </td>
                    <td className="td">
                      <ul className="list-disc space-y-0.5 pl-4">
                        {g.recommendations.map((r) => (
                          <li key={r.enrichmentId}>
                            {r.title} <span className="text-xs text-slate-500">({r.type}{r.durationHrs ? `, ${r.durationHrs}h` : ""})</span>
                          </li>
                        ))}
                        {g.recommendations.length === 0 && <li className="text-xs text-slate-400">No enrichment mapped yet</li>}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(results.strengths.length > 0 || results.developmentAreas.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {results.strengths.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Strengths</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-emerald-900">
                {results.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {results.developmentAreas.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Development areas</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-900">
                {results.developmentAreas.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function UserChip({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
        {user.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")}
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">{user.name}</p>
        <p className="text-[11px] text-slate-400">{ROLE_LABELS[user.role]}</p>
      </div>
    </div>
  );
}
