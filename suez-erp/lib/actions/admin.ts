"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, hashPassword, requireCap } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { CAPABILITY_KEYS } from "@/lib/capabilities";
import { EMAIL_DEFAULTS, ORG_DEFAULTS, getEmailSettings, setSetting } from "@/lib/settings";
import { emailShell, transportFor } from "@/lib/mail";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const idOf = (fd: FormData, k: string) => (str(fd, k) ? Number(str(fd, k)) : null);

/* --------------------------------------------------------------- employees */
export async function saveUser(fd: FormData) {
  const me = await requireCap("people.manage");
  const id = idOf(fd, "id");
  const name = str(fd, "full_name");
  const email = str(fd, "email").toLowerCase();
  if (!name || !email) return { error: "Name and work email are required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email address does not look right." };

  const role = str(fd, "role") || "staff";
  // Handing out a role that can rewrite roles is the one grant that needs the
  // same authority it confers.
  if (!can(me, "roles.manage")) {
    const [{ grants_admin }] = await sql<{ grants_admin: boolean }>`
      select exists (
        select 1 from role_permissions where role_key = ${role} and capability = 'roles.manage'
      ) as grants_admin`;
    if (grants_admin) return { error: "Only someone who manages roles can grant a role that manages roles." };
  }

  const clash = await sql<{ id: number }>`select id from users where lower(email) = ${email} and id <> ${id ?? 0}`;
  if (clash.length) return { error: "Another employee already uses that email." };

  const fields = {
    staff_no: str(fd, "staff_no") || null,
    job_title: str(fd, "job_title") || null,
    department_id: idOf(fd, "department_id"),
    manager_id: idOf(fd, "manager_id"),
    phone: str(fd, "phone") || null,
    status: str(fd, "status") || "active",
  };

  if (id) {
    if (id === me.id && role !== me.role) return { error: "You cannot change your own access level." };
    await sql`
      update users set full_name = ${name}, email = ${email}, role = ${role}, staff_no = ${fields.staff_no},
             job_title = ${fields.job_title}, department_id = ${fields.department_id},
             manager_id = ${fields.manager_id}, phone = ${fields.phone}, status = ${fields.status}
       where id = ${id}`;
    await audit(me.id, "user.update", "user", id, { name });
  } else {
    const password = str(fd, "password") || "Welcome123!";
    if (password.length < 8) return { error: "The starting password must be at least 8 characters." };
    const [row] = await sql<{ id: number }>`
      insert into users (full_name, email, password_hash, role, staff_no, job_title, department_id, manager_id, phone, status, password_change_required)
      values (${name}, ${email}, ${hashPassword(password)}, ${role}, ${fields.staff_no}, ${fields.job_title},
              ${fields.department_id}, ${fields.manager_id}, ${fields.phone}, ${fields.status}, true)
      returning id`;
    // Give the new hire this year's entitlement straight away.
    await sql`
      insert into leave_balances (user_id, leave_type_id, year, entitled, used)
      select ${row.id}, id, extract(year from now()), default_days, 0 from leave_types
      on conflict do nothing`;
    /**
     * Put the new hire on the register for every standing policy that requires a
     * signature. A joiner used to arrive with a clean slate — not on the
     * acknowledgement register for the security policy every colleague had
     * signed — which is exactly the gap an auditor looks for.
     */
    await sql`
      insert into memo_recipients (memo_id, user_id)
      select m.id, ${row.id} from memos m
       where m.status = 'published' and m.requires_ack and m.audience = 'all'
      on conflict do nothing`;
    const [{ policies }] = await sql<{ policies: number }>`
      select count(*)::int as policies from memo_recipients mr
        join memos m on m.id = mr.memo_id
       where mr.user_id = ${row.id} and mr.acknowledged_at is null`;
    await notify(
      [row.id],
      "Welcome to SuezERP",
      policies > 0
        ? `Your temporary password is ${password}. Change it after your first sign-in, then sign the ${policies} standing polic${policies === 1 ? "y" : "ies"} waiting for you.`
        : `Your temporary password is ${password}. Change it after your first sign-in, then set your signature and review your circulars.`,
      "/settings/signature",
      { kind: "security", emailBody: `<p>Your temporary password is <strong>${password}</strong>.</p><p>Sign in with it, change it immediately, then sign out and sign in again.</p>` },
    );
    await audit(me.id, "user.create", "user", row.id, { name, role, policies });
  }

  revalidatePath("/admin/users");
  revalidatePath("/directory");
  return { ok: true };
}

export async function resetPassword(fd: FormData) {
  const me = await requireCap("people.manage");
  const id = Number(str(fd, "id"));
  const password = str(fd, "password");
  if (password.length < 8) return { error: "Use at least 8 characters." };

  await sql`update users set password_hash = ${hashPassword(password)}, password_change_required = true where id = ${id}`;
  await notify([id], "Your password was reset", `${me.full_name} set a temporary password for your account: ${password}. Change it when you sign in.`, "/settings/security", { kind: "security", emailBody: `<p>Your temporary password is <strong>${password}</strong>. Change it immediately after signing in.</p>` });
  await audit(me.id, "user.reset_password", "user", id);
  return { ok: true };
}

/* ------------------------------------------------------------- departments */
/** "Operations" used to become code "O". Take up to three letters per word. */
function departmentCode(name: string) {
  const words = name.split(/[\s&/-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase();
}

export async function saveDepartment(fd: FormData) {
  const me = await requireCap("people.departments");
  const id = idOf(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "A department needs a name." };

  if (id) {
    await sql`update departments set name = ${name}, code = ${str(fd, "code") || null}, head_id = ${idOf(fd, "head_id")} where id = ${id}`;
    await audit(me.id, "department.update", "department", id);
  } else {
    const clash = await sql`select 1 from departments where lower(name) = ${name.toLowerCase()}`;
    if (clash.length) return { error: "That department already exists." };
    await sql`insert into departments (name, code, head_id) values (${name}, ${str(fd, "code") || departmentCode(name)}, ${idOf(fd, "head_id")})`;
    await audit(me.id, "department.create");
  }
  revalidatePath("/admin/departments");
  return { ok: true };
}

export async function deleteDepartment(fd: FormData) {
  const me = await requireCap("people.departments");
  const id = Number(str(fd, "id"));
  const [staff] = await sql<{ n: number }>`select count(*)::int as n from users where department_id = ${id}`;
  if (staff.n > 0) return { error: `Move the ${staff.n} employee(s) in this department first.` };
  await sql`delete from departments where id = ${id}`;
  await audit(me.id, "department.delete", "department", id);
  revalidatePath("/admin/departments");
  return { ok: true };
}

/* ------------------------------------------------------------ leave policy */
export async function saveLeaveType(fd: FormData) {
  const me = await requireCap("people.leave_policy");
  const id = idOf(fd, "id");
  const name = str(fd, "name");
  const days = Number(str(fd, "default_days") || 0);
  if (!name) return { error: "Name the leave type." };
  if (days < 0 || days > 365) return { error: "Days must be between 0 and 365." };

  if (id) {
    await sql`
      update leave_types set name = ${name}, default_days = ${days}, color = ${str(fd, "color") || "#6366f1"},
             paid = ${fd.get("paid") === "on"} where id = ${id}`;
  } else {
    await sql`
      insert into leave_types (name, default_days, color, paid)
      values (${name}, ${days}, ${str(fd, "color") || "#6366f1"}, ${fd.get("paid") === "on"})
      on conflict (name) do update set default_days = excluded.default_days`;
  }
  await audit(me.id, "leave_type.save", "leave_type", id ?? undefined, { name });
  revalidatePath("/admin/leave-types");
  return { ok: true };
}

/** Applies each leave type's default entitlement to every active employee for a year. */
export async function grantEntitlements(fd: FormData) {
  const me = await requireCap("people.leave_policy");
  const year = Number(str(fd, "year")) || new Date().getFullYear();
  await sql`
    insert into leave_balances (user_id, leave_type_id, year, entitled, used)
    select u.id, lt.id, ${year}, lt.default_days, 0
      from users u cross join leave_types lt
     where u.status = 'active'
    on conflict (user_id, leave_type_id, year) do update set entitled = excluded.entitled`;
  await audit(me.id, "leave.grant_entitlements", "year", year);
  revalidatePath("/admin/leave-types");
  revalidatePath("/leave");
  return { ok: true, message: `Entitlements applied for ${year}.` };
}

export async function adjustBalance(fd: FormData) {
  const me = await requireCap("people.leave_policy");
  const userId = Number(str(fd, "user_id"));
  const typeId = Number(str(fd, "leave_type_id"));
  const year = Number(str(fd, "year")) || new Date().getFullYear();
  const entitled = Number(str(fd, "entitled"));
  if (!userId || !typeId || Number.isNaN(entitled)) return { error: "Fill in every field." };

  await sql`
    insert into leave_balances (user_id, leave_type_id, year, entitled, used)
    values (${userId}, ${typeId}, ${year}, ${entitled}, 0)
    on conflict (user_id, leave_type_id, year) do update set entitled = excluded.entitled`;
  await audit(me.id, "leave.adjust_balance", "user", userId, { typeId, year, entitled });
  revalidatePath("/admin/users");
  return { ok: true };
}

/* -------------------------------------------------------------- workspace */
export async function saveOrganisation(fd: FormData) {
  const me = await requireCap("settings.organisation");
  const name = str(fd, "name");
  if (!name) return { error: "The organisation needs a name." };

  await setSetting("organisation", {
    ...ORG_DEFAULTS,
    name,
    short_name: str(fd, "short_name") || name,
    address: str(fd, "address"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    website: str(fd, "website"),
    timezone: str(fd, "timezone") || ORG_DEFAULTS.timezone,
    currency: str(fd, "currency") || ORG_DEFAULTS.currency,
    fiscal_year_start: str(fd, "fiscal_year_start") || ORG_DEFAULTS.fiscal_year_start,
    logo: str(fd, "logo") || null,
  });
  await audit(me.id, "settings.organisation");
  revalidatePath("/", "layout");
  return { ok: true, message: "Organisation details saved." };
}

export async function saveSigningPolicy(fd: FormData) {
  const me = await requireCap("settings.organisation");
  const require_password = fd.get("require_password") === "on";
  await setSetting("signing", { require_password });
  await audit(me.id, "settings.signing", undefined, undefined, { require_password });
  revalidatePath("/settings/organisation");
  return {
    ok: true,
    message: require_password
      ? "Signers will be asked to confirm their password."
      : "Password confirmation is off. Existing signature records are unchanged.",
  };
}

export async function saveEmailSettings(fd: FormData) {
  const me = await requireCap("settings.email");
  const enabled = fd.get("enabled") === "on";
  const host = str(fd, "host");
  if (enabled && !host) return { error: "An SMTP host is required to enable email." };

  const current = await getEmailSettings();
  await setSetting("email", {
    ...EMAIL_DEFAULTS,
    host,
    port: Number(str(fd, "port")) || 587,
    secure: fd.get("secure") === "on",
    user: str(fd, "user"),
    // Blank password means "keep the stored one".
    pass: str(fd, "pass") || current.pass,
    from_name: str(fd, "from_name") || "SuezERP",
    from_email: str(fd, "from_email"),
    enabled,
    // One switch per kind of event, matching NotifyKind in lib/notify.
    notify_on_memo: fd.get("notify_on_memo") === "on",
    notify_on_document: fd.get("notify_on_document") === "on",
    notify_on_leave: fd.get("notify_on_leave") === "on",
    notify_on_request: fd.get("notify_on_request") === "on",
    notify_on_report: fd.get("notify_on_report") === "on",
    notify_on_attendance: fd.get("notify_on_attendance") === "on",
    notify_on_message: fd.get("notify_on_message") === "on",
    notify_on_security: fd.get("notify_on_security") === "on",
    notify_on_general: fd.get("notify_on_general") === "on",
  });
  await audit(me.id, "settings.email", undefined, undefined, { host, enabled });
  revalidatePath("/settings/email");
  return { ok: true, message: "Email settings saved." };
}

/** Sends a test message using the values in the form, not the saved ones. */
export async function testEmail(fd: FormData) {
  const me = await requireCap("settings.email");
  const to = str(fd, "to") || me.email;
  const stored = await getEmailSettings();
  const cfg = {
    ...stored,
    host: str(fd, "host") || stored.host,
    port: Number(str(fd, "port")) || stored.port,
    secure: fd.get("secure") === "on",
    user: str(fd, "user") || stored.user,
    pass: str(fd, "pass") || stored.pass,
    from_name: str(fd, "from_name") || stored.from_name,
    from_email: str(fd, "from_email") || stored.from_email,
  };
  if (!cfg.host) return { error: "Enter an SMTP host first." };

  try {
    await transportFor(cfg).sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email || cfg.user}>`,
      to,
      subject: "SuezERP test message",
      html: await emailShell("Your SMTP settings work", `<p>This test was sent by ${me.full_name} from the portal settings page.</p>`),
    });
  } catch (e) {
    return { error: `SMTP rejected the message: ${(e as Error).message}` };
  }
  await audit(me.id, "settings.email.test", undefined, undefined, { to });
  return { ok: true, message: `Test message sent to ${to}.` };
}

/* ------------------------------------------------------------------ roles */

/**
 * Roles are data now, so this is where they are shaped.
 *
 * ponytail: authority used to be six role names hardcoded across about a
 * hundred checks, so adding "Legal" or "Warehouse" meant a code change and a
 * deploy. Built-in roles keep their key and can have their capabilities edited;
 * custom roles can be created, renamed and removed once nobody holds them.
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
  } else {
    // A built-in keeps its name so the code and the screen agree about it.
    if (!existing.is_builtin) {
      await sql`update roles set name = ${name}, description = ${str(fd, "description") || null} where key = ${key}`;
    } else {
      await sql`update roles set description = ${str(fd, "description") || null} where key = ${key}`;
    }
  }

  const chosen = fd.getAll("capability").map((v) => v.toString()).filter((c) => CAPABILITY_KEYS.includes(c));

  /**
   * Never let the last way back in disappear.
   *
   * If this edit would leave nobody at all able to reach Roles & Access, the
   * system becomes unadministrable and only a database edit can fix it.
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

  await audit(me.id, isNew ? "role.create" : "role.update", "role", key, {
    name,
    capabilities: chosen.length,
  });
  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
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
  if (holders > 0)
    return { error: `${holders} employee(s) still hold this role. Move them to another role first.` };

  await sql`delete from roles where key = ${key}`;
  await audit(me.id, "role.delete", "role", key, { name: role.name });
  revalidatePath("/admin/roles");
  return { ok: true };
}
