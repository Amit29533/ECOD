import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getCandidateById,
  listAssessmentsFor,
  listBlueprints,
  listCandidates,
} from "@/lib/services";
import type { User } from "@/domain/types";
import { AssessmentStatusPill, Badge, CandidateStatusPill, Card, EmptyState, fmtDate } from "@/components/ui";
import { StartAssessmentForm } from "./start-assessment-form";
import { CANDIDATE_JOURNEY, CANDIDATE_JOURNEY_LABELS } from "@/domain/workflow";
import { Stepper } from "@/components/ui";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const { id } = await params;
  const candidate = await getCandidateById(id);
  if (!candidate) notFound();

  const [assessments, assessors, blueprints, candidates] = await Promise.all([
    listAssessmentsFor(await requireUser("admin")),
    (await import("@/lib/services")).listUsers(),
    listBlueprints(),
    listCandidates(await requireUser("admin")),
  ]);
  void candidates;
  const myAssessments = assessments.filter((a) => a.candidateId === candidate.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const assessorOptions = assessors.filter((u: User) => u.role === "assessor" && u.active);

  const journeyIdx = CANDIDATE_JOURNEY.indexOf(candidate.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{candidate.name}</h1>
            <CandidateStatusPill status={candidate.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono text-xs">{candidate.code}</span> · {candidate.email} · {candidate.location ?? "—"}
          </p>
        </div>
        <Link href="/admin/candidates" className="btn-secondary">
          ← Pool
        </Link>
      </div>

      <Card title="Journey">
        <Stepper
          steps={CANDIDATE_JOURNEY.slice(0, 9).map((s) => ({ key: s, label: CANDIDATE_JOURNEY_LABELS[s] }))}
          current={journeyIdx >= 0 ? candidate.status : "intake"}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Professional profile">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row label="Current role" value={candidate.currentRole} />
              <Row label="Experience" value={candidate.yearsExperience ? `${candidate.yearsExperience} years` : undefined} />
              <Row label="Timezone" value={candidate.timezone} />
              <Row label="Source" value={candidate.source} />
              <Row label="Phone" value={candidate.phone} />
              <Row label="LinkedIn" value={candidate.linkedinUrl} />
            </dl>
            {candidate.cvSummary && <p className="mt-4 text-sm leading-relaxed text-slate-600">{candidate.cvSummary}</p>}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {[...candidate.technologies, ...candidate.skills].map((s) => (
                <Badge key={s} tone="blue">
                  {s}
                </Badge>
              ))}
            </div>
            {candidate.intakeNotes && (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-semibold">Intake notes:</span> {candidate.intakeNotes}
              </p>
            )}
          </Card>

          <Card title={`Assessments (${myAssessments.length})`}>
            {myAssessments.length === 0 ? (
              <EmptyState title="No assessments yet" hint="Map this candidate to a role track below." />
            ) : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr>
                    <th className="th">Code</th>
                    <th className="th">Blueprint</th>
                    <th className="th">Status</th>
                    <th className="th">Readiness</th>
                    <th className="th">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myAssessments.map((a) => (
                    <tr key={a.id} className="row-hover">
                      <td className="td">
                        <Link href={`/admin/assessments/${a.id}`} className="font-semibold text-indigo-600 hover:underline">
                          {a.code}
                        </Link>
                      </td>
                      <td className="td font-mono text-xs">{a.blueprintCode}</td>
                      <td className="td">
                        <AssessmentStatusPill status={a.status} />
                      </td>
                      <td className="td font-semibold">{a.results?.readinessScore ?? "—"}</td>
                      <td className="td text-slate-500">{fmtDate(a.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title="Map to role track & allocate assessor"
            subtitle="Creates the assessment and moves the candidate into assessment."
          >
            <StartAssessmentForm
              candidateId={candidate.id}
              blueprints={blueprints.map((b) => ({ code: b.code, name: b.name, roleCode: b.roleCode }))}
              assessors={assessorOptions.map((a: User) => ({ id: a.id, name: a.name, title: a.title }))}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Internal compartment" subtitle="Admin-only: never shown to assessors, validators or candidates.">
            <dl className="space-y-3">
              <Row label="Commercial terms" value={candidate.internal?.commercialTerms} stacked />
              <Row label="Client / pipeline" value={candidate.internal?.clientNotes} stacked />
              <Row label="Rating" value={candidate.internal?.rating} stacked />
            </dl>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Compartmentalisation: these fields are stripped from every non-admin API response and view.
            </p>
          </Card>
          <Card title="Record">
            <dl className="space-y-2">
              <Row label="Created" value={fmtDate(candidate.createdAt)} stacked />
              <Row label="Last updated" value={fmtDate(candidate.updatedAt)} stacked />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, stacked }: { label: string; value?: string | null; stacked?: boolean }) {
  return (
    <div className={stacked ? "" : "sm:grid sm:grid-cols-3 sm:gap-2"}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-sm text-slate-700 ${stacked ? "mt-0.5" : "sm:col-span-2"}`}>{value?.trim() ? value : "—"}</dd>
    </div>
  );
}
