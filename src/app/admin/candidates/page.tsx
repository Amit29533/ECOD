import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCandidates } from "@/lib/services";
import type { Candidate } from "@/domain/types";
import { CandidateStatusPill, Card, EmptyState, fmtDate } from "@/components/ui";
import { AddCandidateForm } from "./add-candidate-form";

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireUser("admin");
  const { status } = await searchParams;
  const all: Candidate[] = await listCandidates(admin);
  const candidates = status ? all.filter((c) => c.status === status) : all;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Candidate pool</h1>
        <p className="text-sm text-slate-500">
          Full-pool view is admin-only. {status && <span className="font-semibold">Filtered: {status}. </span>}
          {status && (
            <Link href="/admin/candidates" className="font-semibold text-indigo-600 hover:underline">
              Clear filter
            </Link>
          )}
        </p>
      </div>

      <Card title={`Candidates (${candidates.length})`}>
        {candidates.length === 0 ? (
          <EmptyState title="No candidates yet" hint="Use the intake form below to add the first one." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Current role</th>
                  <th className="th">Exp.</th>
                  <th className="th">Technologies</th>
                  <th className="th">Status</th>
                  <th className="th">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((c) => (
                  <tr key={c.id} className="row-hover">
                    <td className="td font-mono text-xs">{c.code}</td>
                    <td className="td">
                      <Link href={`/admin/candidates/${c.id}`} className="font-semibold text-indigo-600 hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{c.email}</span>
                    </td>
                    <td className="td">{c.currentRole ?? "—"}</td>
                    <td className="td">{c.yearsExperience ?? "—"}y</td>
                    <td className="td text-xs">{c.technologies.slice(0, 3).join(", ")}</td>
                    <td className="td">
                      <CandidateStatusPill status={c.status} />
                    </td>
                    <td className="td text-slate-500">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Candidate intake" subtitle="Capture a professional; internal/commercial fields stay in the admin compartment.">
        <AddCandidateForm />
      </Card>
    </div>
  );
}
