import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/api";
import { createUser, listUsers } from "@/lib/services";

export async function GET() {
  return withUser(async (user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    const users = await listUsers();
    return NextResponse.json({
      users: users.map(({ passwordHash: _drop, ...safe }) => safe),
    });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    const { name, email, role, password, title } = body ?? {};
    if (!name || !email || !password || !["admin", "assessor", "candidate"].includes(role)) {
      return NextResponse.json({ error: "name, email, password and a valid role are required." }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const created = await createUser({ name, email, role, title, password });
    const { passwordHash: _drop, ...safe } = created;
    return NextResponse.json({ user: safe }, { status: 201 });
  });
}
