import Link from "next/link";
import type { User } from "@/domain/types";
import { UserChip } from "@/components/ui";
import { LogoutButton } from "@/components/logout-button";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Compartmentalised app shell: navigation is built per role, so an assessor
 * never even sees a link to the candidate pool, content config or user admin.
 */
export function AppShell({
  user,
  nav,
  workspaceLabel,
  children,
}: {
  user: User;
  nav: NavItem[];
  workspaceLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-black text-white">E</span>
          <div className="leading-tight">
            <p className="text-sm font-black tracking-wide text-white">ECOD</p>
            <p className="text-[10px] text-slate-400">Enterprise Capability on Demand</p>
          </div>
        </div>
        <p className="px-5 pb-2 pt-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">{workspaceLabel}</p>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4">
          <UserChip user={user} />
          <div className="mt-3 flex justify-end">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/content", label: "Domain content" },
  { href: "/admin/users", label: "Users & access" },
];

export const ASSESSOR_NAV: NavItem[] = [{ href: "/assessor", label: "My assessments" }];

export const CANDIDATE_NAV: NavItem[] = [{ href: "/candidate", label: "My journey" }];
