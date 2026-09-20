import { sql } from "./db";
import { emailShell, sendNotificationEmail } from "./mail";
import { getEmailSettings, type EmailSettings } from "./settings";

/**
 * One notification, delivered in the app and by email.
 *
 * ponytail: `notify()` wrote a row in `notifications` and stopped there. The
 * CRM had SMTP wired up the whole time — campaigns used it — but no internal
 * notification ever went out by email, so a lead assigned to you, a deposit
 * running dry and an account reassigned out from under you were all things you
 * found out by opening the CRM.
 *
 * Both halves now come from one call, which is the only way they stay in step.
 * Email is best-effort: sendNotificationEmail swallows its own failures, and a
 * mail server that is down must not roll back the drawdown it was announcing.
 */

export type NotifyKind =
  | "lead"
  | "deal"
  | "quote"
  | "ticket"
  | "deposit"
  | "assignment"
  | "security"
  | "general";

export type NotifyOptions = {
  kind?: NotifyKind;
  entity?: string;
  entityId?: string | number;
  /** The wording on the inbox's quick action. Defaults to "Open". */
  actionLabel?: string;
  /** Extra paragraphs for the email only — the in-app row stays short. */
  emailBody?: string;
  /** Force email off for something genuinely not worth a message. */
  email?: boolean;
};

/** Which settings switch governs each kind. */
const SWITCH: Record<NotifyKind, keyof EmailSettings> = {
  lead: "notify_on_lead",
  deal: "notify_on_deal",
  quote: "notify_on_quote",
  ticket: "notify_on_ticket",
  deposit: "notify_on_deposit",
  assignment: "notify_on_assignment",
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

  // Who actually exists and is still active. Read first, because RETURNING can
  // only see the row that was inserted.
  const people = await sql<{ id: number; email: string; full_name: string }>`
    select id, email, full_name from users
     where id = any(${ids}::int[]) and status = 'active'`;
  if (!people.length) return;

  const rows = await sql<{ id: number; user_id: number }>`
    insert into notifications (user_id, title, body, href, kind, entity, entity_id, action_label)
    select u.id, ${title}, ${body}, ${href}, ${kind}, ${opts.entity ?? null},
           ${opts.entityId?.toString() ?? null}, ${opts.actionLabel ?? null}
      from unnest(${people.map((p) => p.id)}::int[]) as u(id)
    returning id, user_id`;

  if (opts.email === false) return;
  const cfg = await getEmailSettings();
  if (!cfg.enabled || cfg[SWITCH[kind]] === false) return;

  const link = appUrl(href);
  const html = await emailShell(
    escape(title),
    `${body ? `<p>${escape(body)}</p>` : ""}${opts.emailBody ?? ""}`,
    link ? { label: opts.actionLabel || "Open in the CRM", href: link } : undefined,
  );

  // One message each, so nobody learns who else was told.
  const rowFor = new Map(rows.map((r) => [r.user_id, r.id]));
  for (const person of people) {
    if (!person.email) continue;
    const sent = await sendNotificationEmail(person.email, title, html);
    const id = rowFor.get(person.id);
    if (sent.sent && id) await sql`update notifications set emailed_at = now() where id = ${id}`;
  }
}

/**
 * Everyone holding a capability — used where a notification is addressed to an
 * authority rather than to a person, such as "whoever watches client money".
 */
export async function usersWithCapability(capability: string) {
  return sql<{ id: number; full_name: string; email: string }>`
    select u.id, u.full_name, u.email
      from users u
      join role_permissions rp on rp.role_key = u.role
     where rp.capability = ${capability} and u.status = 'active'
     order by u.full_name`;
}
