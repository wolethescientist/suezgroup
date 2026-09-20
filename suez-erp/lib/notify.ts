import { sql } from "./db";
import { emailShell, sendMail } from "./mail";
import { getEmailSettings, type EmailSettings } from "./settings";

/**
 * One notification, delivered in the app and by email.
 *
 * ponytail: `notify()` only ever wrote a row in `notifications`, and email was
 * a separate `sendMail` written out by hand at four of the twenty-nine places
 * that notify people. So leave and requests mailed you, and a circular you had
 * to sign, a document waiting on your signature, a report that was due and an
 * approval sitting on your desk did not — you found out by opening the portal.
 *
 * Both halves now come from the same call, which is the only way they stay in
 * step. Email remains best-effort: `sendMail` swallows its own failures, and a
 * mail server that is down must never roll back the thing it was announcing.
 */

/** What happened, for the per-event switches under Settings → Email. */
export type NotifyKind =
  | "memo"
  | "document"
  | "leave"
  | "request"
  | "report"
  | "attendance"
  | "message"
  | "security"
  | "general";

export type NotifyOptions = {
  kind?: NotifyKind;
  /** What the notification is about, so the inbox can group and de-duplicate. */
  entity?: string;
  entityId?: string | number;
  /** Offered as a direct download from the inbox, without opening the page. */
  attachmentId?: number | null;
  /** The wording on the inbox's quick action. Defaults to "Open". */
  actionLabel?: string;
  /** Extra paragraphs for the email only — the in-app row stays short. */
  emailBody?: string;
  /** Force email off for something genuinely not worth a message. */
  email?: boolean;
};

/** Which settings switch governs each kind. */
const SWITCH: Record<NotifyKind, keyof EmailSettings> = {
  memo: "notify_on_memo",
  document: "notify_on_document",
  leave: "notify_on_leave",
  request: "notify_on_request",
  report: "notify_on_report",
  attendance: "notify_on_attendance",
  message: "notify_on_message",
  security: "notify_on_security",
  general: "notify_on_general",
};

/** Absolute base for links in email, where a relative href means nothing. */
export function appUrl(href?: string | null) {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (!href) return base || "";
  return base ? `${base}${href.startsWith("/") ? "" : "/"}${href}` : href;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function notify(
  userIds: (number | null | undefined)[],
  title: string,
  body: string | null = null,
  href: string | null = null,
  opts: NotifyOptions = {},
) {
  const ids = [...new Set(userIds)].filter((n): n is number => typeof n === "number" && n > 0);
  if (!ids.length) return;

  const kind = opts.kind ?? "general";

  // Who actually exists and is still employed, resolved first. RETURNING can
  // only see the row that was inserted, so the addresses have to be read here
  // rather than pulled back out of the insert.
  const people = await sql<{ id: number; email: string; full_name: string }>`
    select id, email, full_name from users
     where id = any(${ids}::int[]) and status = 'active'`;
  if (!people.length) return;

  const rows = await sql<{ id: number; user_id: number }>`
    insert into notifications (user_id, title, body, href, kind, entity, entity_id, attachment_id, action_label)
    select u.id, ${title}, ${body}, ${href}, ${kind}, ${opts.entity ?? null},
           ${opts.entityId?.toString() ?? null}, ${opts.attachmentId ?? null}, ${opts.actionLabel ?? null}
      from unnest(${people.map((p) => p.id)}::int[]) as u(id)
    returning id, user_id`;

  if (opts.email === false) return;
  const cfg = await getEmailSettings();
  if (!cfg.enabled || cfg[SWITCH[kind]] === false) return;

  const link = appUrl(href);
  const html = await emailShell(
    escape(title),
    `${body ? `<p>${escape(body)}</p>` : ""}${opts.emailBody ?? ""}`,
    link ? { label: opts.actionLabel || "Open in the portal", href: link } : undefined,
  );

  // One message each, so a circular does not put the whole company in the To:
  // line — which is what a single sendMail to every recipient used to do.
  const rowFor = new Map(rows.map((r) => [r.user_id, r.id]));
  for (const person of people) {
    if (!person.email) continue;
    const sent = await sendMail(person.email, title, html);
    const id = rowFor.get(person.id);
    if (sent.sent && id) await sql`update notifications set emailed_at = now() where id = ${id}`;
  }
}

/**
 * Everyone holding a capability. Used wherever a notification is addressed to
 * an authority rather than to a person — "whoever approves an approver's leave",
 * "whoever receives the weekly reports".
 */
export async function usersWithCapability(capability: string) {
  return sql<{ id: number; full_name: string; email: string }>`
    select u.id, u.full_name, u.email
      from users u
      join role_permissions rp on rp.role_key = u.role
     where rp.capability = ${capability} and u.status = 'active'
     order by u.full_name`;
}
