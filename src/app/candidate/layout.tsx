import { requireUser } from "@/lib/auth";
import { CANDIDATE_NAV, AppShell } from "@/components/shell";

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("candidate");
  return (
    <AppShell user={user} nav={CANDIDATE_NAV} workspaceLabel="Candidate portal">
      {children}
    </AppShell>
  );
}
