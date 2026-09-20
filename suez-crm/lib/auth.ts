import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sql } from "./db";
import { readToken, signToken } from "./token";
import { canAny } from "./permissions";
export { can, canAny } from "./permissions";
export { hashPassword, verifyPassword } from "./password";

const COOKIE = "sz_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

/**
 * A role is now a row in `roles`, not a fixed union, so this is just its key.
 * The built-in four are still there; an administrator can add more.
 */
export type Role = string;

export type SessionUser = {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  job_title: string | null;
  department_id: number | null;
  department: string | null;
  avatar_url: string | null;
  signature: string | null;
  staff_no: string | null;
  phone: string | null;
  /** The display name of their role, for the interface. */
  role_name: string;
  /**
   * What this person may do, resolved from their role when the session loads.
   * Carrying it on the session keeps `can()` synchronous.
   */
  capabilities: string[];
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set. Copy .env.example to .env.");
  return s;
}

export async function createSession(userId: number) {
  const token = signToken({ id: userId, exp: Date.now() + MAX_AGE * 1000 }, secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Current user, or null. Deduped per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const id = readToken<{ id: number; exp: number }>((await cookies()).get(COOKIE)?.value, secret())?.id;
  if (!id) return null;
  const rows = await sql<SessionUser>`
    select u.id, u.full_name, u.email, u.role, u.job_title, u.department_id,
           u.avatar_url, u.signature, u.staff_no, u.phone, d.name as department,
           coalesce(r.name, u.role) as role_name,
           coalesce(
             (select array_agg(rp.capability) from role_permissions rp where rp.role_key = u.role),
             '{}'
           ) as capabilities
      from users u
      left join departments d on d.id = u.department_id
      left join roles r on r.key = u.role
     where u.id = ${id} and u.status = 'active'`;
  return rows[0] ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Page-level guard: send them home if they do not hold any of these. */
export async function requireCap(...capabilities: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAny(user, ...capabilities)) redirect("/");
  return user;
}
