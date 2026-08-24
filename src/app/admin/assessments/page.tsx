import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCandidateById, listAssessmentsFor, listUsers } from "@/lib/services";
import { AssessmentStatusPill, Card, EmptyState, fmtDate } from "@/components/ui";

export default async function AssessmentsPage() {
  const user = await requireUser("admin");
  const [assessments, users] = await Promise.all([listAssessmentsFor(user), listUsers()]);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const candidates = await Promise.all(assessments.map((a) => getCandidateById(a.candidateId)));
  const candidateById = new Map(candidates.map((c) => [c?.id ?? "", c]));
  if (!user) notFound();

  const sorted = [...assessments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Assessments</h1>
        <p className="text-sm text-slate-500">Every assessment across the platform, with allocation and outcomes.</p>
      </div>

      <Card title={`All assessments (${sorted.length})`}>
        {sorted.length === 0 ? (
          <EmptyState title="No assessments yet" hint="Create one from a candidate's page." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Candidate</th>
                  <th className="th">Track</th>
                  <th className="th">Blueprint</th>
                  <th className="th">Assessor</th>
                  <th className="th">Status</th>
                  <th className="th">Readiness</th>
                  <th className="th">Gaps</th>
                  <th className="th">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((a) => (
                  <tr key={a.id} className="row-hover">
                    <td className="td">
                      <Link href={`/admin/assessments/${a.id}`} className="font-semibold text-indigo-600 hover:underline">
                        {a.code}
                      </Link>
                    </td>
                    <td className="td">{candidateById.get(a.candidateId)?.name ?? "—"}</td>
                    <td className="td">{a.roleCode}</td>
                    <td className="td font-mono text-xs">{a.blueprintCode}</td>
                    <td className="td">{a.assessorId ? usersById.get(a.assessorId)?.name ?? "—" : "—"}</td>
                    <td className="td">
                      <AssessmentStatusPill status={a.status} />
                    </td>
                    <td className="td font-semibold">{a.results?.readinessScore ?? "—"}</td>
                    <td className="td">{a.results?.gaps.length ?? "—"}</td>
                    <td className="td text-slate-500">{fmtDate(a.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
