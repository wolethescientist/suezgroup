import { sql } from "./db";
import { can, type SessionUser } from "./auth";
import { remainingRatio } from "./deposits";

/**
 * Everything waiting on one person, gathered from every module.
 *
 * ponytail: a notification row was written when something happened, and that
 * was the whole of the inbox. But a notification records an event, not an
 * obligation — mark it read and the deposit that is nearly empty, the quote
 * about to expire and the unanswered ticket all vanish from view while being
 * just as outstanding. So the actionable half is queried from the things
 * themselves, and cannot be dismissed into nothing.
 */

export type InboxItem = {
  key: string;
  kind: "deposit" | "ticket" | "quote" | "lead" | "deal" | "activity";
  title: string;
  detail: string;
  href: string;
  action: string;
  urgent?: boolean;
  when?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export async function inboxFor(me: SessionUser): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  const wideDeposits = can(me, "deposit.view");

  // Client money that needs attention -----------------------------------------
  const deposits = await sql<{
    id: number; ref: string; company: string; name: string; currency: string;
    funded: string; balance: string; low_balance_ratio: string; last_movement_on: string | null;
  }>`
    select d.id, d.ref, c.name as company, d.name, d.currency,
           b.funded, b.balance, d.low_balance_ratio, b.last_movement_on
      from crm_deposits d
      join crm_companies c on c.id = d.company_id
      join crm_deposit_balances b on b.deposit_id = d.id
     where d.status = 'active'
       and (${wideDeposits} or d.owner_id = ${me.id} or c.owner_id = ${me.id})
       and b.balance <= b.funded * d.low_balance_ratio
     order by b.balance`;
  for (const d of deposits) {
    const funded = Number(d.funded);
    const balance = Number(d.balance);
    const empty = balance <= 0;
    items.push({
      key: `deposit:${d.id}`,
      kind: "deposit",
      title: empty ? `${d.company} — deposit exhausted` : `${d.company} — deposit running low`,
      detail: `${d.ref} · ${Math.round(remainingRatio(funded, balance) * 100)}% of ${d.currency} ${funded.toLocaleString()} left`,
      href: `/deposits/${d.id}`,
      action: empty ? "Record funding" : "Open the account",
      urgent: empty,
      when: d.last_movement_on,
    });
  }

  // Tickets on my desk ---------------------------------------------------------
  const tickets = await sql<{ id: number; ref: string; subject: string; priority: string; company: string | null; created_at: string }>`
    select t.id, t.ref, t.subject, t.priority, c.name as company, t.created_at
      from crm_tickets t
      left join crm_companies c on c.id = t.company_id
     where t.status in ('open','pending')
       and (t.assignee_id = ${me.id} or (t.assignee_id is null and ${can(me, "record.edit_any")}))
     order by t.created_at`;
  for (const t of tickets) {
    items.push({
      key: `ticket:${t.id}`,
      kind: "ticket",
      title: t.subject,
      detail: `${t.ref}${t.company ? ` · ${t.company}` : ""}`,
      href: `/tickets/${t.id}`,
      action: "Answer it",
      urgent: t.priority === "urgent" || t.priority === "high",
      when: t.created_at,
    });
  }

  // Quotes sitting unanswered, and ones about to lapse --------------------------
  const quotes = await sql<{ id: number; ref: string; title: string; company: string | null; valid_until: string | null; total: string; currency: string }>`
    select q.id, q.ref, q.title, c.name as company, q.valid_until, q.total, q.currency
      from crm_quotes q
      left join crm_companies c on c.id = q.company_id
     where q.status = 'sent'
       and (q.owner_id = ${me.id} or ${can(me, "record.edit_any")})
     order by q.valid_until nulls last`;
  for (const q of quotes) {
    const lapsing = !!q.valid_until && q.valid_until <= today();
    items.push({
      key: `quote:${q.id}`,
      kind: "quote",
      title: `${q.title}${q.company ? ` — ${q.company}` : ""}`,
      detail: `${q.ref} · ${q.currency} ${Number(q.total).toLocaleString()}${
        q.valid_until ? ` · ${lapsing ? "expired" : `valid to ${q.valid_until}`}` : ""
      }`,
      href: `/quotes/${q.id}`,
      action: lapsing ? "Chase or close it" : "Chase it",
      urgent: lapsing,
      when: q.valid_until,
    });
  }

  // New leads on my desk -------------------------------------------------------
  const leads = await sql<{ id: number; full_name: string; company_name: string | null; score: number; created_at: string }>`
    select id, full_name, company_name, score, created_at
      from crm_leads
     where status = 'new' and owner_id = ${me.id}
     order by score desc, created_at`;
  for (const l of leads) {
    items.push({
      key: `lead:${l.id}`,
      kind: "lead",
      title: `${l.full_name}${l.company_name ? ` — ${l.company_name}` : ""}`,
      detail: `New lead · score ${l.score}`,
      href: "/leads",
      action: "Work it",
      urgent: l.score >= 70,
      when: l.created_at,
    });
  }

  // Activities due -------------------------------------------------------------
  const activities = await sql<{ id: number; subject: string; kind: string; due_at: string }>`
    select id, subject, kind, due_at
      from crm_activities
     where owner_id = ${me.id} and completed_at is null and due_at is not null and due_at <= now() + interval '1 day'
     order by due_at`;
  for (const a of activities) {
    items.push({
      key: `activity:${a.id}`,
      kind: "activity",
      title: a.subject,
      detail: `${a.kind} due`,
      href: "/activities",
      action: "Open activities",
      urgent: a.due_at <= new Date().toISOString(),
      when: a.due_at,
    });
  }

  return items.sort((a, b) => {
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    return (a.when ?? "").localeCompare(b.when ?? "");
  });
}
