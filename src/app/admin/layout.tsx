import { requireUser } from "@/lib/auth";
import { ADMIN_NAV, AppShell } from "@/components/shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("admin");
  return (
    <AppShell user={user} nav={ADMIN_NAV} workspaceLabel="Platform administration">
      {children}
    </AppShell>
  );
}
