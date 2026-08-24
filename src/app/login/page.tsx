import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleHome } from "@/domain/rbac";
import { ensureSeeded } from "@/lib/services";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (user) redirect(roleHome(user));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 text-xl font-black text-white shadow-lg">
            E
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">ECOD Platform</h1>
          <p className="mt-1 text-sm text-slate-400">Enterprise Capability on Demand</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          Compartmentalised access: each role sees only what its function requires.
          <br />
          Pilot build — demo accounts are seeded locally.
        </p>
      </div>
    </div>
  );
}
