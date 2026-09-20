"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, hashPassword, requireCap } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { CAPABILITY_KEYS } from "@/lib/capabilities";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const idOf = (fd: FormData, k: string) => (str(fd, k) ? Number(str(fd, k)) : null);

/* ------------------------------------------------------------------ users */

/**
 * Add and edit the people who use the CRM.
 *
 * ponytail: the CRM had no user-management screen at all. It read the `users`
 * table for owners, assignees and reporting, but the only way to add somebody
 * or change their access was to edit the database or use the ERP.
 */
export async function saveUser(fd: FormData) {
  const me = await requireCap("people.manage");
  const id = idOf(fd, "id");
  const name = str(fd, "full_name");
  const email = str(fd, "email").toLowerCase();
  if (!name || !email) return { error: "Name and work email are required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email address does not look right." };

  const role = str(fd, "role") || "staff";
  const [known] = await sql<{ key: string }>`select key from roles where key = ${role}`;
  if (!known) return { error: "That role no longer exists." };

  const clash = await sql<{ id: number }>`select id from users where lower(email) = ${email} and id <> ${id ?? 0}`;
  if (clash.length) return { error: "Somebody already uses that email address." };

  // Handing out a role that can rewrite roles needs the same authority it confers.
  if (!can(me, "roles.manage")) {
    const [{ grants_admin }] = await sql<{ grants_admin: boolean }>`
      select exists (
        select 1 from role_permissions where role_key = ${role} and capability = 'roles.manage'
      ) as grants_admin`;
    if (grants_admin) return { error: "Only someone who manages roles can grant a role that manages roles." };
  }

  const fields = {
    staff_no: str(fd, "staff_no") || null,
    job_title: str(fd, "job_title") || null,
    manager_id: idOf(fd, "manager_id"),
    phone: str(fd, "phone") || null,
    status: str(fd, "status") || "active",
  };

  if (id) {
    if (id === me.id && role !== me.role) return { error: "You cannot change your own access level." };
    await sql`
      update users set full_name = ${name}, email = ${email}, role = ${role}, staff_no = ${fields.staff_no},
             job_title = ${fields.job_title}, manager_id = ${fields.manager_id}, phone = ${fields.phone},
             status = ${fields.status}
       where id = ${id}`;
    await audit(me.id, "user.update", "user", id, { name, role });
  } else {
    const password = str(fd, "password") || "Welcome123!";
    if (password.length < 8) return { error: "The starting password must be at least 8 characters." };
    const [row] = await sql<{ id: number }>`
      insert into users (full_name, email, password_hash, role, staff_no, job_title, manager_id, phone, status, password_change_required)
      values (${name}, ${email}, ${hashPassword(password)}, ${role}, ${fields.staff_no}, ${fields.job_title},
              ${fields.manager_id}, ${fields.phone}, ${fields.status}, true)
      returning id`;
    await notify([row.id], "Welcome to SuezCRM", `Your temporary password is ${password}. Change it when you first sign in.`, "/settings/security", { kind: "security", emailBody: `<p>Your temporary password is <strong>${password}</strong>.</p><p>Change it immediately after signing in.</p>` });
    await audit(me.id, "user.create", "user", row.id, { name, role });
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function resetUserPassword(fd: FormData) {
  const me = await requireCap("people.manage");
  const id = Number(str(fd, "id"));
  const password = str(fd, "password");
  if (password.length < 8) return { error: "The new password must be at least 8 characters." };
  const [person] = await sql<{ id: number }>`
    update users set password_hash = ${hashPassword(password)}, password_change_required = true where id = ${id}
    returning id`;
  if (!person) return { error: "User not found." };
  await notify([person.id], "Your SuezCRM password was reset", `Your temporary password is ${password}. Change it when you next sign in.`, "/settings/security", { kind: "security", emailBody: `<p>Your temporary password is <strong>${password}</strong>.</p><p>Change it immediately after signing in.</p>` });
  await audit(me.id, "user.password_reset", "user", id);
  revalidatePath("/users");
  return { ok: true, message: "Password reset and the temporary password was emailed to the user." };
}

/* ------------------------------------------------------------------ roles */

/**
 * Roles are data now, so this is where they are shaped.
 *
 * Built-in roles keep their key and can have their capabilities edited; custom
 * roles can be created, renamed and removed once nobody holds them.
 */
export async function saveRole(fd: FormData) {
  const me = await requireCap("roles.manage");
  const key = str(fd, "key").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
  const name = str(fd, "name");
  if (!name) return { error: "Give the role a name." };
  if (!key) return { error: "Give the role a key — lowercase letters, numbers and underscores." };

  const [existing] = await sql<{ key: string; is_builtin: boolean }>`
    select key, is_builtin from roles where key = ${key}`;
  const isNew = !existing;

  if (isNew) {
    await sql`
      insert into roles (key, name, description, is_builtin, seeded_at)
      values (${key}, ${name}, ${str(fd, "description") || null}, false, now())`;
  } else if (!existing.is_builtin) {
    await sql`update roles set name = ${name}, description = ${str(fd, "description") || null} where key = ${key}`;
  } else {
    // A built-in keeps its name so the code and the screen agree about it.
    await sql`update roles set description = ${str(fd, "description") || null} where key = ${key}`;
  }

  const chosen = fd.getAll("capability").map((v) => v.toString()).filter((c) => CAPABILITY_KEYS.includes(c));

  /**
   * Never let the last way back in disappear. If this edit would leave nobody
   * able to reach Roles & Access, only a database edit could fix it.
   */
  if (!chosen.includes("roles.manage")) {
    const [{ others }] = await sql<{ others: number }>`
      select count(*)::int as others
        from users u
        join role_permissions rp on rp.role_key = u.role
       where rp.capability = 'roles.manage' and u.status = 'active' and u.role <> ${key}`;
    if (others === 0)
      return { error: "Somebody has to keep 'Manage roles'. Grant it to another role first, or leave it here." };
  }

  await sql`delete from role_permissions where role_key = ${key}`;
  for (const capability of chosen) {
    await sql`insert into role_permissions (role_key, capability) values (${key}, ${capability})`;
  }

  await audit(me.id, isNew ? "role.create" : "role.update", "role", key, { name, capabilities: chosen.length });
  revalidatePath("/roles");
  revalidatePath("/users");
  return { ok: true, message: isNew ? "Role created." : "Role saved." };
}

export async function deleteRole(fd: FormData) {
  const me = await requireCap("roles.manage");
  const key = str(fd, "key");
  const [role] = await sql<{ is_builtin: boolean; name: string }>`
    select is_builtin, name from roles where key = ${key}`;
  if (!role) return { error: "That role no longer exists." };
  if (role.is_builtin) return { error: "Built-in roles cannot be deleted. You can change what they do instead." };

  const [{ holders }] = await sql<{ holders: number }>`
    select count(*)::int as holders from users where role = ${key}`;
  if (holders > 0) return { error: `${holders} user(s) still hold this role. Move them to another role first.` };

  await sql`delete from roles where key = ${key}`;
  await audit(me.id, "role.delete", "role", key, { name: role.name });
  revalidatePath("/roles");
  return { ok: true };
}
