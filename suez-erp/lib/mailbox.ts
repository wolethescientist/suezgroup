import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { sql } from "./db";
import { open } from "./secretbox";
import { normaliseMailFolders, sortMailFolders, type MailFolder } from "./mail-folders";
import { readableImapError, readableSmtpError } from "./mail-errors";

export type MailAccount = {
  id: number;
  user_id: number;
  email: string;
  display_name: string | null;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  imap_pass: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  signature: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  status: string;
};

export async function accountFor(userId: number): Promise<MailAccount | null> {
  const [a] = await sql<MailAccount>`select * from mail_accounts where user_id = ${userId} and status <> 'disabled' limit 1`;
  return a ?? null;
}

export async function foldersFor(accountId: number): Promise<MailFolder[]> {
  const folders = await sql<MailFolder>`
    select account_id, path, name, delimiter, special_use, selectable, subscribed, discovered_at
      from mail_folders
     where account_id = ${accountId}`;
  return sortMailFolders(folders);
}

function imapClient(a: MailAccount) {
  const pass = open(a.imap_pass);
  if (!pass) throw new Error("Stored mailbox password could not be decrypted. Re-enter it in Settings → Mailbox.");
  return new ImapFlow({
    host: a.imap_host,
    port: a.imap_port,
    secure: a.imap_secure,
    auth: { user: a.imap_user, pass },
    logger: false,
    // A dead mail host must not hang a page render.
    socketTimeout: 20_000,
    greetingTimeout: 10_000,
  });
}

/**
 * Reads and persists the server's current LIST response. Existing rows are
 * only retired after every returned folder has been stored successfully.
 */
export async function discoverFolders(a: MailAccount) {
  let c: ImapFlow | null = null;
  try {
    c = imapClient(a);
    await c.connect();
    const boxes = await c.list();
    const folders = normaliseMailFolders(boxes);
    if (!folders.length) throw new Error("The IMAP server did not return any folders.");

    const discoveredAt = new Date().toISOString();
    for (const folder of folders) {
      await sql`
        insert into mail_folders
          (account_id, path, name, delimiter, special_use, selectable, subscribed, discovered_at)
        values
          (${a.id}, ${folder.path}, ${folder.name}, ${folder.delimiter}, ${folder.special_use},
           ${folder.selectable}, ${folder.subscribed}, ${discoveredAt})
        on conflict (account_id, path) do update set
          name = excluded.name,
          delimiter = excluded.delimiter,
          special_use = excluded.special_use,
          selectable = excluded.selectable,
          subscribed = excluded.subscribed,
          discovered_at = excluded.discovered_at`;
    }
    await sql`
      delete from mail_folders
       where account_id = ${a.id} and discovered_at <> ${discoveredAt}`;
    await sql`update mail_accounts set last_error = null, status = 'active' where id = ${a.id}`;
    return { ok: true as const, folders };
  } catch (e) {
    const error = readableImapError(e, a.imap_host);
    await sql`update mail_accounts set last_error = ${error}, status = 'error' where id = ${a.id}`;
    return { ok: false as const, error };
  } finally {
    await c?.logout().catch(() => {});
  }
}

/**
 * Pulls the newest messages in a folder into `mail_messages`.
 *
 * Incremental: only UIDs above the highest already stored are fetched, so a
 * second sync of an unchanged mailbox costs one SEARCH. Flags on messages we
 * already hold are refreshed separately, because seen/flagged change server-side
 * without the UID changing.
 */
export async function syncFolder(a: MailAccount, folder: string, limit = 80) {
  const [known] = await sql<{ selectable: boolean }>`
    select selectable from mail_folders where account_id = ${a.id} and path = ${folder}`;
  if (!known?.selectable) {
    return { ok: false as const, error: "That folder is not selectable or is no longer available on the IMAP server." };
  }
  let c: ImapFlow | null = null;
  let imported = 0;
  try {
    c = imapClient(a);
    await c.connect();
    const lock = await c.getMailboxLock(folder);
    try {
      const [{ max }] = await sql<{ max: number | null }>`
        select max(uid)::bigint as max from mail_messages where account_id = ${a.id} and folder = ${folder}`;
      const since = Number(max ?? 0);

      const range = since > 0 ? `${since + 1}:*` : `1:*`;
      const uids = (await c.search({ uid: range }, { uid: true })) || [];
      const wanted = uids.filter((u) => u > since).slice(-limit);

      for (const uid of wanted) {
        const msg = await c.fetchOne(String(uid), { uid: true, source: true, flags: true, envelope: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const p = await simpleParser(msg.source);
        // `msg.size` is not populated by a source fetch on every server, so the
        // raw message length is the reliable figure.
        const sizeBytes = msg.source.length;
        const flags = msg.flags ?? new Set<string>();
        const text = (p.text ?? "").trim();
        const addr = (v: unknown) =>
          v && typeof v === "object" && "text" in (v as any) ? String((v as any).text) : null;

        await sql`
          insert into mail_messages
            (account_id, folder, uid, message_id, in_reply_to, from_name, from_email,
             to_emails, cc_emails, subject, snippet, body_text, body_html,
             seen, flagged, answered, has_attachments, size_bytes, sent_at)
          values
            (${a.id}, ${folder}, ${uid}, ${p.messageId ?? null}, ${p.inReplyTo ?? null},
             ${p.from?.value?.[0]?.name ?? null}, ${p.from?.value?.[0]?.address ?? null},
             ${addr(p.to)}, ${addr(p.cc)}, ${p.subject ?? "(no subject)"},
             ${text.slice(0, 200)}, ${text}, ${p.html || null},
             ${flags.has("\\Seen")}, ${flags.has("\\Flagged")}, ${flags.has("\\Answered")},
             ${(p.attachments?.length ?? 0) > 0}, ${sizeBytes},
             ${p.date ? p.date.toISOString() : null})
          on conflict (account_id, folder, uid) do nothing`;
        imported++;
      }

      // Refresh flags on the most recent stored messages — cheap, and stops the
      // unread badge disagreeing with the user's phone.
      const recent = await sql<{ uid: string }>`
        select uid from mail_messages where account_id = ${a.id} and folder = ${folder}
         order by uid desc limit 200`;
      if (recent.length) {
        for await (const m of c.fetch(recent.map((r) => r.uid).join(","), { uid: true, flags: true }, { uid: true })) {
          const f = m.flags ?? new Set<string>();
          await sql`
            update mail_messages set seen = ${f.has("\\Seen")}, flagged = ${f.has("\\Flagged")}, answered = ${f.has("\\Answered")}
             where account_id = ${a.id} and folder = ${folder} and uid = ${m.uid}`;
        }
      }
    } finally {
      lock.release();
    }
    await sql`update mail_accounts set last_sync_at = now(), last_error = null, status = 'active' where id = ${a.id}`;
    return { ok: true as const, imported };
  } catch (e) {
    const error = readableImapError(e, a.imap_host);
    await sql`update mail_accounts set last_error = ${error}, status = 'error' where id = ${a.id}`;
    return { ok: false as const, error };
  } finally {
    await c?.logout().catch(() => {});
  }
}

/** Mirrors a read/flag change back to the IMAP server. Best-effort: the local row is already updated. */
export async function setFlag(a: MailAccount, folder: string, uid: number, flag: "\\Seen" | "\\Flagged", on: boolean) {
  const c = imapClient(a);
  try {
    await c.connect();
    const lock = await c.getMailboxLock(folder);
    try {
      if (on) await c.messageFlagsAdd(String(uid), [flag], { uid: true });
      else await c.messageFlagsRemove(String(uid), [flag], { uid: true });
    } finally {
      lock.release();
    }
    return { ok: true as const };
  } catch (e) {
    console.error("setFlag failed", e);
    return { ok: false as const, error: (e as Error).message };
  } finally {
    await c.logout().catch(() => {});
  }
}

export function smtpFor(a: MailAccount) {
  const pass = open(a.smtp_pass);
  if (!pass) throw new Error("Stored mailbox password could not be decrypted. Re-enter it in Settings → Mailbox.");
  return nodemailer.createTransport({
    host: a.smtp_host,
    port: a.smtp_port,
    secure: a.smtp_secure,
    auth: { user: a.smtp_user, pass },
  });
}

export async function sendAs(
  a: MailAccount,
  msg: { to: string; cc?: string; bcc?: string; subject: string; html: string; text?: string; inReplyTo?: string | null },
) {
  const [row] = await sql<{ id: number }>`
    insert into mail_outbox (account_id, to_emails, cc_emails, bcc_emails, subject, body_html, body_text)
    values (${a.id}, ${msg.to}, ${msg.cc ?? null}, ${msg.bcc ?? null}, ${msg.subject}, ${msg.html}, ${msg.text ?? null})
    returning id`;
  try {
    await smtpFor(a).sendMail({
      from: `"${a.display_name ?? a.email}" <${a.email}>`,
      to: msg.to,
      cc: msg.cc || undefined,
      bcc: msg.bcc || undefined,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      inReplyTo: msg.inReplyTo || undefined,
      references: msg.inReplyTo || undefined,
    });
    await sql`update mail_outbox set status = 'sent', sent_at = now() where id = ${row.id}`;
    return { ok: true as const };
  } catch (e) {
    const error = readableSmtpError(e);
    await sql`update mail_outbox set status = 'failed', error = ${error} where id = ${row.id}`;
    return { ok: false as const, error };
  }
}
