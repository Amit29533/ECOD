import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCandidateById, listAssessmentsFor } from "@/lib/services";
import { AssessmentStatusPill, Card, EmptyState, fmtDate } from "@/components/ui";

export default async function AssessorWorkspace() {
  const user = await requireUser("assessor");
  const assessments = (await listAssessmentsFor(user)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const candidates = await Promise.all(assessments.map((a) => getCandidateById(a.candidateId)));
  const byId = new Map(candidates.map((c) => [c?.id ?? "", c]));

  const actionable = assessments.filter((a) => ["online_complete", "assessor_scoring"].includes(a.status));
  const waiting = assessments.filter((a) => ["allocated", "online_in_progress"].includes(a.status));
  const done = assessments.filter((a) => ["scored", "gap_mapped"].includes(a.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My assessments</h1>
        <p className="text-sm text-slate-500">
          Welcome, {user.name}. You only see assessments allocated to you — never the wider candidate pool, client relationships or
          commercials.
        </p>
      </div>

      <Card title={`Ready to score (${actionable.length})`} subtitle="Online section submitted — rubric scoring awaited">
        {actionable.length === 0 ? (
          <EmptyState title="Nothing to score right now" hint="Candidates you're allocated to will appear here once they submit." />
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <tbody className="divide-y divide-slate-100">
              {actionable.map((a) => {
                const c = byId.get(a.candidateId);
                return (
                  <tr key={a.id} className="row-hover">
                    <td className="td">
                      <Link href={`/assessor/assessments/${a.id}`} className="font-semibold text-indigo-600 hover:underline">
                        {a.code}
                      </Link>
                      <span className="block text-xs text-slate-500">{a.blueprintCode}</span>
                    </td>
                    <td className="td">
                      <span className="font-semibold text-slate-800">{c?.name ?? "—"}</span>
                      <span className="block text-xs text-slate-500">
                        {c?.currentRole ?? "—"} · {c?.yearsExperience ?? "—"}y · {(c?.technologies ?? []).slice(0, 3).join(", ")}
                      </span>
                    </td>
                    <td className="td">
                      <AssessmentStatusPill status={a.status} />
                    </td>
                    <td className="td text-right">
                      <Link href={`/assessor/assessments/${a.id}`} className="btn-primary">
                        Score →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {waiting.length > 0 && (
        <Card title={`Awaiting candidate (${waiting.length})`} subtitle="Allocated to you; candidate hasn't submitted the online section yet">
          <table className="min-w-full divide-y divide-slate-200">
            <tbody className="divide-y divide-slate-100">
              {waiting.map((a) => {
                const c = byId.get(a.candidateId);
                return (
                  <tr key={a.id} className="row-hover">
                    <td className="td font-mono text-xs">{a.code}</td>
                    <td className="td">{c?.name ?? "—"}</td>
                    <td className="td">
                      <AssessmentStatusPill status={a.status} />
                    </td>
                    <td className="td text-slate-500">{fmtDate(a.allocatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {done.length > 0 && (
        <Card title={`Completed (${done.length})`} subtitle="Scored — results and gap maps are with the admin team">
          <table className="min-w-full divide-y divide-slate-200">
            <tbody className="divide-y divide-slate-100">
              {done.map((a) => {
                return (
                  <tr key={a.id} className="row-hover">
                    <td className="td">
                      <Link href={`/assessor/assessments/${a.id}`} className="font-semibold text-indigo-600 hover:underline">
                        {a.code}
                      </Link>
                    </td>
                    <td className="td">{byId.get(a.candidateId)?.name ?? "—"}</td>
                    <td className="td">
                      <AssessmentStatusPill status={a.status} />
                    </td>
                    <td className="td font-semibold">{a.results?.readinessScore ?? "—"}</td>
                    <td className="td text-slate-500">{fmtDate(a.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
