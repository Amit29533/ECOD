import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dashboardStats, listAssessmentsFor, getCandidateById, listUsers } from "@/lib/services";
import { AssessmentStatusPill, Card, EmptyState, StatCard, fmtDate } from "@/components/ui";
import { CANDIDATE_JOURNEY_LABELS } from "@/domain/workflow";

export default async function AdminDashboard() {
  const user = await requireUser("admin");
  const [stats, assessments, users] = await Promise.all([
    dashboardStats(),
    listAssessmentsFor(user),
    listUsers(),
  ]);
  const recent = [...assessments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const candidatesById = new Map(
    (await Promise.all(recent.map((a) => getCandidateById(a.candidateId)))).map((c) => [c?.id, c]),
  );
  const assessors = users.filter((u) => u.role === "assessor");

  const funnel = Object.entries(stats.candidateStatus).filter(([, n]) => n > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Talent pipeline</h1>
          <p className="text-sm text-slate-500">Candidate pool, assessment flow and capability outcomes.</p>
        </div>
        <Link href="/admin/candidates" className="btn-primary">
          + Add candidate
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Candidates" value={stats.totalCandidates} hint={`${assessors.length} assessors available`} />
        <StatCard label="In assessment" value={stats.assessmentStatus.allocated + stats.assessmentStatus.online_in_progress + stats.assessmentStatus.online_complete + stats.assessmentStatus.assessor_scoring} hint="Assessments in flight" />
        <StatCard label="Avg readiness" value={stats.avgReadiness ?? "—"} hint="Scored assessments (0-100)" />
        <StatCard label="Open capability gaps" value={stats.openGaps} hint="Across completed assessments" />
      </div>

      <Card title="Journey funnel" subtitle="Candidates by lifecycle stage">
        {funnel.length === 0 ? (
          <EmptyState title="No candidates yet" hint="Add your first candidate to start the pipeline." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {funnel.map(([status, n]) => (
              <Link
                key={status}
                href={`/admin/candidates?status=${status}`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <span className="font-bold text-slate-900">{n}</span>{" "}
                <span className="text-slate-600">{CANDIDATE_JOURNEY_LABELS[status as keyof typeof CANDIDATE_JOURNEY_LABELS] ?? status}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Recent assessments"
        subtitle="Latest activity across all assessors"
        actions={
          <Link href="/admin/assessments" className="text-xs font-semibold text-indigo-600 hover:underline">
            View all →
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState title="No assessments yet" hint="Open a candidate and start a role assessment." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Assessment</th>
                  <th className="th">Candidate</th>
                  <th className="th">Track</th>
                  <th className="th">Status</th>
                  <th className="th">Readiness</th>
                  <th className="th">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((a) => {
                  const candidate = candidatesById.get(a.candidateId);
                  return (
                    <tr key={a.id} className="row-hover">
                      <td className="td">
                        <Link href={`/admin/assessments/${a.id}`} className="font-semibold text-indigo-600 hover:underline">
                          {a.code}
                        </Link>
                      </td>
                      <td className="td">{candidate?.name ?? "—"}</td>
                      <td className="td">{a.roleCode}</td>
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
          </div>
        )}
      </Card>
    </div>
  );
}
