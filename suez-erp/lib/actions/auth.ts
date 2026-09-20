"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "../db";
import { createSession, destroySession, getUser, hashPassword, requireUser, verifyPassword } from "../auth";
import { audit } from "../audit";
import { notify } from "../notify";
import { deleteByRef, resolveImageField } from "../attachments";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

/**
 * How many failures, over what window, before an account is held.
 * Generous enough that a person mistyping their password twice is unaffected.
 */
const MAX_FAILURES = 8;
const WINDOW_MINUTES = 15;

/** Best-effort client IP. Behind a proxy this is the forwarded header. */
async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
}

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email || !password) return { error: "Enter your email and password." };

  const ip = await clientIp();

  /**
   * ponytail: there was no limit here at all, and only successful logins were
   * recorded — so a credential-stuffing run against this form was both
   * unlimited and invisible. Failures are now counted per account and per
   * origin, and every attempt lands in login_attempts and the audit trail.
   */
  const [recent] = await sql<{ by_email: number; by_ip: number }>`
    select
      count(*) filter (where lower(email) = ${email})::int as by_email,
      count(*) filter (where ip is not null and ip = ${ip})::int as by_ip
      from login_attempts
     where ok = false and created_at > now() - (${WINDOW_MINUTES} || ' minutes')::interval`;

  if (recent.by_email >= MAX_FAILURES || recent.by_ip >= MAX_FAILURES * 3) {
    await sql`insert into login_attempts (email, ip, ok) values (${email}, ${ip}, false)`;
    await audit(null, "auth.login.blocked", "user", undefined, { email, ip });
    return {
      error: `Too many failed attempts. Try again in ${WINDOW_MINUTES} minutes, or ask IT & Digital to reset your password.`,
    };
  }

  const rows = await sql<{ id: number; password_hash: string; status: string; password_change_required: boolean }>`
    select id, password_hash, status, password_change_required from users where lower(email) = ${email}`;
  const user = rows[0];

  const fail = async (reason: string, message: string) => {
    await sql`insert into login_attempts (email, ip, ok) values (${email}, ${ip}, false)`;
    await audit(user?.id ?? null, "auth.login.failed", "user", user?.id, { email, ip, reason });
    return { error: message };
  };

  if (!user || !verifyPassword(password, user.password_hash))
    return fail("bad_credentials", "Incorrect email or password.");
  if (user.status !== "active")
    return fail("suspended", "This account has been suspended. Contact HR.");

  await sql`insert into login_attempts (email, ip, ok) values (${email}, ${ip}, true)`;

  /**
   * Tell the account holder that their account was used.
   *
   * ponytail: a successful sign-in was recorded in the audit trail and nowhere
   * a person would see it, so somebody signing in as you was invisible unless
   * an administrator went looking. The previous sign-in and the address are in
   * the message because that is what makes it checkable.
   */
  const [previous] = await sql<{ last_login_at: string | null; full_name: string }>`
    select last_login_at, full_name from users where id = ${user.id}`;

  await createSession(user.id);
  await sql`update users set last_login_at = now() where id = ${user.id}`;

  await notify(
    [user.id],
    "New sign-in to your account",
    previous?.last_login_at
      ? `Previous sign-in: ${new Date(previous.last_login_at).toLocaleString()}${ip ? ` · this one from ${ip}` : ""}`
      : `Welcome — this is the first sign-in on this account${ip ? `, from ${ip}` : ""}.`,
    "/settings/security",
    {
      kind: "security",
      entity: "user",
      entityId: user.id,
      actionLabel: "Review your account",
      emailBody: `<p>If this was not you, change your password immediately and tell IT.</p>`,
    },
  );

  await audit(user.id, "auth.login", "user", user.id, { ip });
  redirect(user.password_change_required ? "/settings/security?first_login=1" : "/");
}

export async function logout() {
  const me = await getUser();
  if (me) await audit(me.id, "auth.logout", "user", me.id);
  await destroySession();
  redirect("/login");
}

export async function updateProfile(fd: FormData) {
  const me = await requireUser();
  const full_name = str(fd, "full_name");
  if (!full_name) return { error: "Name cannot be empty." };

  let avatar: { value: string | null; discard: string | null };
  try {
    avatar = await resolveImageField(str(fd, "avatar_url"), me.avatar_url, `avatar-${me.id}`, me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  await sql`
    update users set full_name = ${full_name},
                     phone = ${str(fd, "phone") || null},
                     job_title = ${str(fd, "job_title") || null},
                     avatar_url = ${avatar.value}
     where id = ${me.id}`;
  // Only after the row no longer points at it.
  if (avatar.discard !== avatar.value) await deleteByRef(avatar.discard);

  await audit(me.id, "profile.update");
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated." };
}

export async function saveSignature(fd: FormData) {
  const me = await requireUser();
  const submitted = str(fd, "signature");
  if (!submitted) return { error: "Draw or upload a signature first." };

  let signature: { value: string | null; discard: string | null };
  try {
    signature = await resolveImageField(submitted, me.signature, `signature-${me.id}`, me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  await sql`update users set signature = ${signature.value} where id = ${me.id}`;
  if (signature.discard !== signature.value) await deleteByRef(signature.discard);

  await audit(me.id, "signature.save");
  revalidatePath("/settings/signature");
  revalidatePath("/", "layout");
  return { ok: true, message: "Signature saved." };
}

export async function clearSignature() {
  const me = await requireUser();
  await sql`update users set signature = null where id = ${me.id}`;
  await deleteByRef(me.signature);
  await audit(me.id, "signature.clear");
  revalidatePath("/settings/signature");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePassword(fd: FormData) {
  const me = await requireUser();
  const current = str(fd, "current_password");
  const next = str(fd, "new_password");
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== str(fd, "confirm_password")) return { error: "The new passwords do not match." };

  const rows = await sql<{ password_hash: string }>`select password_hash from users where id = ${me.id}`;
  if (!rows[0] || !verifyPassword(current, rows[0].password_hash)) return { error: "Current password is incorrect." };

  await sql`update users set password_hash = ${hashPassword(next)}, password_change_required = false where id = ${me.id}`;
  await notify([me.id], "Your password was changed", "If this was not you, tell IT immediately.", "/settings/security", {
    kind: "security",
    entity: "user",
    entityId: me.id,
  });
  await audit(me.id, "password.change");
  await destroySession();
  redirect("/login?password_changed=1");
}
