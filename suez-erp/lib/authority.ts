import { sql } from "./db";

/**
 * Who holds a capability, asked of the database rather than of the session.
 *
 * `can()` answers for the person who is signed in. These answer for somebody
 * else — "is the person applying for this leave one of the people who approves
 * everyone else's" — which is the question routing has to ask before it can
 * decide where a request should go.
 */

export async function holdsCapability(userId: number, capability: string) {
  const [row] = await sql<{ ok: boolean }>`
    select exists (
      select 1 from users u
        join role_permissions rp on rp.role_key = u.role
       where u.id = ${userId} and rp.capability = ${capability}
    ) as ok`;
  return !!row?.ok;
}

/** Everyone active who holds it, in a stable order. */
export async function holdersOf(capability: string) {
  return sql<{ id: number; full_name: string; email: string; job_title: string | null }>`
    select u.id, u.full_name, u.email, u.job_title
      from users u
      join role_permissions rp on rp.role_key = u.role
     where rp.capability = ${capability} and u.status = 'active'
     order by u.full_name`;
}
