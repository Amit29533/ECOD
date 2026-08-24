import { requireUser } from "@/lib/auth";
import { ASSESSOR_NAV, AppShell } from "@/components/shell";

export default async function AssessorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("assessor");
  return (
    <AppShell user={user} nav={ASSESSOR_NAV} workspaceLabel="Assessor workspace">
      {children}
    </AppShell>
  );
}
