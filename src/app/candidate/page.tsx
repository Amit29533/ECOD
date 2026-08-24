import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCandidateForUser, listAssessmentsFor } from "@/lib/services";
import { Card, EmptyState, ResultsView, Stepper } from "@/components/ui";
import { CANDIDATE_JOURNEY, CANDIDATE_JOURNEY_LABELS } from "@/domain/workflow";

export default async function CandidateHome() {
  const user = await requireUser("candidate");
  const candidate = await getCandidateForUser(user);
  const assessments = candidate
    ? (await listAssessmentsFor(user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  if (!candidate) {
    return (
      <EmptyState
        title="No candidate record linked to this login yet"
        hint="The ECOD team is preparing your journey — check back shortly."
      />
    );
  }

  const active = assessments.find((a) => !["gap_mapped"].includes(a.status));
  const completed = assessments.filter((a) => a.results);
  const journeyIdx = Math.max(0, CANDIDATE_JOURNEY.indexOf(candidate.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Your ECOD journey, {candidate.name.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">
          From assessment to enterprise-ready: we measure real capability, show you exactly where you stand, and close the gaps.
        </p>
      </div>

      <Card title="Progress">
        <Stepper
          steps={CANDIDATE_JOURNEY.slice(0, 9).map((s) => ({ key: s, label: CANDIDATE_JOURNEY_LABELS[s] }))}
          current={candidate.status}
        />
        {journeyIdx <= 4 && (
          <p className="mt-3 text-xs text-slate-500">
            Next steps after assessment: targeted enrichment for any capability gaps, then independent validation.
          </p>
        )}
      </Card>

      {active && (
        <Card title="Assessment in progress" subtitle={`${active.roleCode} track · ${active.blueprintCode}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {["allocated", "online_in_progress"].includes(active.status)
                ? "Your knowledge check is ready — it takes about 25 minutes."
                : "Your answers are in. Our assessor is completing the deep-dive scoring; you'll see results here."}
            </p>
            {["allocated", "online_in_progress"].includes(active.status) && (
              <Link href={`/candidate/assessment/${active.id}`} className="btn-primary">
                {active.status === "online_in_progress" ? "Continue knowledge check →" : "Start knowledge check →"}
              </Link>
            )}
          </div>
        </Card>
      )}

      {completed.map((a) => (
        <Card key={a.id} title={`Results — ${a.roleCode} assessment (${a.code})`} subtitle="Your capability profile and development plan.">
          <ResultsView results={a.results!} />
        </Card>
      ))}

      {!active && completed.length === 0 && (
        <EmptyState title="No assessment yet" hint="You'll be notified as soon as your assessment is allocated." />
      )}
    </div>
  );
}
