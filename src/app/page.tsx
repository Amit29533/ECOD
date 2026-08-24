import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleHome } from "@/domain/rbac";
import { ensureSeeded } from "@/lib/services";

export default async function Home() {
  await ensureSeeded();
  const user = await getCurrentUser();
  redirect(user ? roleHome(user) : "/login");
}
