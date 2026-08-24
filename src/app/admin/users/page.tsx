import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/services";
import { Badge, Card, fmtDate } from "@/components/ui";
import { AddUserForm } from "./add-user-form";

const ROLE_TONES: Record<string, string> = { admin: "violet", assessor: "blue", candidate: "green" };

export default async function UsersPage() {
  await requireUser("admin");
  const users = [...(await listUsers())].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Users &amp; access</h1>
        <p className="text-sm text-slate-500">
          Role-based access control: admins see everything; assessors only see candidates allocated to them; candidates only see their own journey.
        </p>
      </div>

      <Card title={`Users (${users.length})`}>
        <table className="min-w-full divide-y divide-slate-200">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Title</th>
              <th className="th">Active</th>
              <th className="th">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="row-hover">
                <td className="td font-semibold text-slate-800">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">
                  <Badge tone={ROLE_TONES[u.role]}>{u.role}</Badge>
                </td>
                <td className="td">{u.title ?? "—"}</td>
                <td className="td">{u.active ? "Yes" : "No"}</td>
                <td className="td text-slate-500">{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Add user" subtitle="Create assessors (and future trainers/validators) here.">
        <AddUserForm />
      </Card>
    </div>
  );
}
