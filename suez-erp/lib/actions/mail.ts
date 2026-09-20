"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { seal } from "@/lib/secretbox";
import { accountFor, discoverFolders, sendAs, setFlag, syncFolder, type MailAccount } from "@/lib/mailbox";
import { defaultMailFolder, mailFolderLabel } from "@/lib/mail-folders";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

/**
 * Saves a staff mailbox. Passwords are sealed with SESSION_SECRET; a blank
 * password field on an edit keeps the stored one, so the form can render a
 * placeholder without ever round-tripping the secret to the browser.
 */
export async function saveMailAccount(fd: FormData) {
  const me = await requireUser();
  const email = str(fd, "email").toLowerCase();
  const imapHost = str(fd, "imap_host");
  const smtpHost = str(fd, "smtp_host");
  if (!email || !imapHost || !smtpHost) return { error: "Email address, IMAP host and SMTP host are all required." };
  const smtpPort = Number(str(fd, "smtp_port")) || 587;
  const smtpSecure = fd.get("smtp_secure") === "on";
  if (smtpPort === 587 && smtpSecure) {
    return { error: "Port 587 uses STARTTLS. Turn off Implicit TLS, or change the port to 465 and keep Implicit TLS enabled." };
  }

  const existing = await accountFor(me.id);
  const imapPass = str(fd, "imap_pass");
  const smtpPass = str(fd, "smtp_pass") || imapPass;
  if (!existing && !imapPass) return { error: "Enter the mailbox password." };

  const imapUser = str(fd, "imap_user") || email;
  const smtpUser = str(fd, "smtp_user") || imapUser;

  if (existing) {
    await sql`
      update mail_accounts
         set display_name = ${str(fd, "display_name") || me.full_name}, email = ${email},
             imap_host = ${imapHost}, imap_port = ${Number(str(fd, "imap_port")) || 993},
             imap_secure = ${fd.get("imap_secure") === "on"}, imap_user = ${imapUser},
             imap_pass = ${imapPass ? seal(imapPass) : existing.imap_pass},
             smtp_host = ${smtpHost}, smtp_port = ${smtpPort},
             smtp_secure = ${smtpSecure}, smtp_user = ${smtpUser},
             smtp_pass = ${smtpPass ? seal(smtpPass) : existing.smtp_pass},
             signature = ${str(fd, "signature") || null}, status = 'active', last_error = null
       where id = ${existing.id}`;
  } else {
    await sql`
      insert into mail_accounts (user_id, display_name, email, imap_host, imap_port, imap_secure, imap_user, imap_pass,
                                 smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, signature)
      values (${me.id}, ${str(fd, "display_name") || me.full_name}, ${email},
              ${imapHost}, ${Number(str(fd, "imap_port")) || 993}, ${fd.get("imap_secure") === "on"}, ${imapUser}, ${seal(imapPass)},
              ${smtpHost}, ${smtpPort}, ${smtpSecure}, ${smtpUser}, ${seal(smtpPass)},
              ${str(fd, "signature") || null})`;
  }

  await audit(me.id, "mail.account.save", "mail_account", undefined, { email });
  const saved = await accountFor(me.id);
  const discovered = saved ? await discoverFolders(saved) : null;
  revalidatePath("/settings/mailbox");
  revalidatePath("/mail");
  if (!discovered?.ok) {
    return { error: `Mailbox saved, but its IMAP folders could not be discovered: ${discovered?.error ?? "account unavailable"}` };
  }
  return { ok: true, message: `Mailbox saved. Found ${discovered.folders.length} IMAP folder(s).` };
}

export async function testMailAccount() {
  const me = await requireUser();
  const a = await accountFor(me.id);
  if (!a) return { error: "Save the mailbox first." };
  const res = await discoverFolders(a);
  if (!res.ok) return { error: `Could not sign in: ${res.error}` };
  revalidatePath("/settings/mailbox");
  revalidatePath("/mail");
  const names = res.folders.filter((folder) => folder.selectable).slice(0, 8).map(mailFolderLabel);
  return { ok: true, message: `Connected. Found ${res.folders.length} folder(s): ${names.join(", ")}` };
}

export async function deleteMailAccount() {
  const me = await requireUser();
  await sql`delete from mail_accounts where user_id = ${me.id}`;
  await audit(me.id, "mail.account.delete");
  revalidatePath("/settings/mailbox");
  revalidatePath("/mail");
  return { ok: true };
}

export async function syncMail(fd: FormData) {
  const me = await requireUser();
  const a = await accountFor(me.id);
  if (!a) return { error: "Set your mailbox up in Settings → Mailbox first." };
  const discovered = await discoverFolders(a);
  if (!discovered.ok) return { error: `Folder refresh failed: ${discovered.error}` };
  const requested = str(fd, "folder");
  const selectable = discovered.folders.filter((folder) => folder.selectable);
  const folder = requested
    ? selectable.find((candidate) => candidate.path === requested)
    : defaultMailFolder(selectable);
  if (!folder) return { error: requested ? "That folder is no longer available on the IMAP server." : "The IMAP server has no selectable folders." };
  const res = await syncFolder(a, folder.path);
  revalidatePath("/mail");
  if (!res.ok) return { error: `Sync failed: ${res.error}` };
  return { ok: true, message: res.imported ? `Pulled ${res.imported} new message(s).` : "Already up to date." };
}

/** Marks read locally straight away, then mirrors the flag to IMAP. */
export async function markRead(fd: FormData) {
  const me = await requireUser();
  const a = await accountFor(me.id);
  if (!a) return { error: "No mailbox configured." };
  const id = Number(str(fd, "id"));
  const seen = str(fd, "seen") !== "false";

  const [m] = await sql<{ folder: string; uid: string }>`
    select m.folder, m.uid from mail_messages m
     where m.id = ${id} and m.account_id = ${a.id}`;
  if (!m) return { error: "That message is not in your mailbox." };

  await sql`update mail_messages set seen = ${seen} where id = ${id}`;
  await setFlag(a, m.folder, Number(m.uid), "\\Seen", seen);
  revalidatePath("/mail");
  return { ok: true };
}

export async function toggleFlag(fd: FormData) {
  const me = await requireUser();
  const a = await accountFor(me.id);
  if (!a) return { error: "No mailbox configured." };
  const id = Number(str(fd, "id"));
  const [m] = await sql<{ folder: string; uid: string; flagged: boolean }>`
    select folder, uid, flagged from mail_messages where id = ${id} and account_id = ${a.id}`;
  if (!m) return { error: "That message is not in your mailbox." };

  await sql`update mail_messages set flagged = ${!m.flagged} where id = ${id}`;
  await setFlag(a, m.folder, Number(m.uid), "\\Flagged", !m.flagged);
  revalidatePath("/mail");
  return { ok: true };
}

export async function sendMailMessage(fd: FormData) {
  const me = await requireUser();
  const a = await accountFor(me.id);
  if (!a) return { error: "Set your mailbox up in Settings → Mailbox first." };

  const to = str(fd, "to");
  const subject = str(fd, "subject");
  // Textareas submit CRLF; normalise so the stored plain-text part is clean.
  const body = str(fd, "body").replace(/\r\n/g, "\n");
  if (!to) return { error: "Enter at least one recipient." };
  if (!body) return { error: "The message is empty." };

  const html = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6">${body
    .split("\n")
    .map((l) => escapeHtml(l))
    .join("<br>")}${a.signature ? `<br><br>--<br>${escapeHtml(a.signature).split("\n").join("<br>")}` : ""}</div>`;

  const res = await sendAs(a as MailAccount, {
    to,
    cc: str(fd, "cc") || undefined,
    bcc: str(fd, "bcc") || undefined,
    subject: subject || "(no subject)",
    html,
    text: body,
    inReplyTo: str(fd, "in_reply_to") || null,
  });

  await audit(me.id, "mail.send", "mail", undefined, { to, ok: res.ok });
  if (!res.ok) return { error: `Could not send: ${res.error}` };
  revalidatePath("/mail");
  redirect("/mail?sent=1");
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
