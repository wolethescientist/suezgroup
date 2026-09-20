import { sql } from "./db";
import { can, type SessionUser } from "./auth";
import { currentReportingPeriod, periodLabel } from "./periods";

/**
 * Everything waiting on one person, gathered from every module.
 *
 * ponytail: a notification row was written whenever something happened, and
 * that was the whole of the inbox. But a notification is a record of an event,
 * not of an obligation — mark it read and the unsigned policy, the request on
 * your desk and the document waiting for your signature all vanish from view
 * while still being just as outstanding. So the actionable half of the inbox is
 * queried from the things themselves, and cannot be dismissed into nothing.
 */

export type InboxItem = {
  key: string;
  kind: "document" | "memo" | "leave" | "request" | "report" | "timesheet" | "expense";
  title: string;
  detail: string;
  href: string;
  /** Wording for the primary action. */
  action: string;
  /** A file that can be handed over without opening the page first. */
  attachmentId?: number | null;
  /** Sorts to the top and is coloured as such. */
  urgent?: boolean;
  when?: string | null;
  /**
   * Set when the item is a notice rather than a task — a document that came
   * back decided. Everything else leaves the inbox by being done; a notice
   * needs somewhere to say "I have seen this", or it sits there for ever.
   */
  dismissRouteId?: number;
};

export async function inboxFor(me: SessionUser): Promise<InboxItem[]> {
  const items: InboxItem[] = [];

  // Documents sent to me for a decision -------------------------------------
  const desk = await sql<{
    id: number; ref: string; ask: string; memo_id: number; title: string;
    sender: string; instructions: string | null; due_date: string | null; created_at: string;
  }>`
    select r.id, r.ref, r.ask, r.memo_id, m.title, u.full_name as sender, r.instructions, r.due_date, r.created_at
      from document_routes r
      join memos m on m.id = r.memo_id
      join users u on u.id = r.sender_id
     where r.recipient_id = ${me.id} and r.status = 'pending'
     order by r.due_date nulls last, r.created_at`;
  for (const d of desk) {
    items.push({
      key: `route:${d.id}`,
      kind: "document",
      title: d.title,
      detail: `${d.ref} · ${d.sender} asks you to ${verb(d.ask)}${d.instructions ? ` — ${d.instructions}` : ""}`,
      href: `/memos/${d.memo_id}`,
      action: "Open and decide",
      urgent: !!d.due_date && d.due_date <= new Date().toISOString().slice(0, 10),
      when: d.created_at,
    });
  }

  // Documents I sent that have come back ------------------------------------
  const back = await sql<{
    id: number; ref: string; memo_id: number; title: string; status: string;
    recipient: string; decision_note: string | null; decided_at: string;
  }>`
    select r.id, r.ref, r.memo_id, m.title, r.status, u.full_name as recipient, r.decision_note, r.decided_at
      from document_routes r
      join memos m on m.id = r.memo_id
      join users u on u.id = r.recipient_id
     where r.sender_id = ${me.id} and r.status in ('approved','rejected') and r.seen_at is null
     order by r.decided_at desc`;
  for (const b of back) {
    items.push({
      key: `returned:${b.id}`,
      kind: "document",
      title: `${b.status === "approved" ? "Approved" : "Rejected"}: ${b.title}`,
      detail: `${b.ref} · ${b.recipient}${b.decision_note ? ` — ${b.decision_note}` : ""}`,
      href: `/memos/${b.memo_id}`,
      action: "View the outcome",
      urgent: b.status === "rejected",
      when: b.decided_at,
      dismissRouteId: b.id,
    });
  }

  // Circulars and policies awaiting my signature ----------------------------
  const unsigned = await sql<{ id: number; ref: string; title: string; kind: string; published_at: string; file_id: number | null }>`
    select m.id, m.ref, m.title, m.kind, m.published_at, m.attachment_id as file_id
      from memo_recipients mr join memos m on m.id = mr.memo_id
     where mr.user_id = ${me.id} and m.status = 'published'
       and m.requires_ack and mr.acknowledged_at is null
     order by m.published_at desc`;
  for (const u of unsigned) {
    items.push({
      key: `memo:${u.id}`,
      kind: "memo",
      title: u.title,
      detail: `${u.ref} · this ${u.kind} needs your signature`,
      href: `/memos/${u.id}`,
      action: "Read and sign",
      attachmentId: u.file_id,
      urgent: true,
      when: u.published_at,
    });
  }

  // Requests on my desk, and my department's unclaimed queue ----------------
  const requests = await sql<{
    id: number; ref: string; title: string; requester: string; priority: string;
    due_date: string | null; created_at: string; queued: boolean;
  }>`
    select r.id, r.ref, r.title, u.full_name as requester, r.priority, r.due_date, r.created_at,
           (r.assignee_id is null) as queued
      from workflow_requests r
      join users u on u.id = r.requester_id
     where r.status in ('pending','in_progress','awaiting_info')
       and (r.assignee_id = ${me.id}
            or (r.assignee_id is null and r.department_id = ${me.department_id ?? 0}))
     order by r.created_at`;
  for (const r of requests) {
    items.push({
      key: `request:${r.id}`,
      kind: "request",
      title: r.title,
      detail: `${r.ref} · ${r.requester}${r.queued ? " · unclaimed in your department" : ""}`,
      href: `/requests/${r.id}`,
      action: r.queued ? "Claim it" : "Open the request",
      urgent: r.priority === "urgent" || (!!r.due_date && r.due_date <= new Date().toISOString().slice(0, 10)),
      when: r.created_at,
    });
  }

  // Leave awaiting my decision ----------------------------------------------
  if (can(me, "leave.approve_any") || can(me, "leave.approve_executive") || me.role === "manager") {
    const executive = can(me, "leave.approve_executive");
    const wide = can(me, "leave.approve_any");
    const leave = await sql<{ id: number; ref: string; staff: string; type: string; days: string; start_date: string; created_at: string }>`
      select lr.id, lr.ref, u.full_name as staff, lt.name as type, lr.days, lr.start_date, lr.created_at
        from leave_requests lr
        join users u on u.id = lr.user_id
        join leave_types lt on lt.id = lr.leave_type_id
       where lr.status = 'pending'
         and lr.user_id <> ${me.id}
         and (${wide} or ${executive} or u.manager_id = ${me.id})
         and (${executive}
              or not exists (select 1 from role_permissions rp
                              where rp.role_key = u.role and rp.capability = 'leave.approve_any'))
       order by lr.created_at`;
    for (const l of leave) {
      items.push({
        key: `leave:${l.id}`,
        kind: "leave",
        title: `${l.staff} — ${l.type}`,
        detail: `${l.ref} · ${Number(l.days)} day(s) from ${l.start_date}`,
        href: `/leave/${l.id}`,
        action: "Approve or reject",
        when: l.created_at,
      });
    }
  }

  // Reports I owe -----------------------------------------------------------
  for (const kind of ["weekly", "monthly"] as const) {
    const period = currentReportingPeriod(kind);
    const [sent] = await sql<{ id: number }>`
      select id from staff_reports
       where user_id = ${me.id} and kind = ${kind} and period_start = ${period} and status <> 'draft'`;
    if (sent) continue;
    items.push({
      key: `report:${kind}:${period}`,
      kind: "report",
      title: `${kind === "weekly" ? "Weekly" : "Monthly"} report outstanding`,
      detail: periodLabel(kind, period),
      href: `/reports/new?kind=${kind}&period=${period}`,
      action: "Write it",
      when: null,
    });
  }

  // Reports sent to me, not yet responded to --------------------------------
  if (can(me, "report.view_all")) {
    const waiting = await sql<{ id: number; ref: string; title: string; author: string; submitted_at: string; file_id: number | null }>`
      select r.id, r.ref, r.title, u.full_name as author, r.submitted_at,
             (select f.attachment_id from report_files f where f.report_id = r.id order by f.id limit 1) as file_id
        from staff_reports r join users u on u.id = r.user_id
       where r.status = 'submitted' and r.user_id <> ${me.id}
       order by r.submitted_at desc
       limit 40`;
    for (const w of waiting) {
      items.push({
        key: `report-in:${w.id}`,
        kind: "report",
        title: w.title,
        detail: `${w.ref} · ${w.author}`,
        href: `/reports/${w.id}`,
        action: "Read it",
        attachmentId: w.file_id,
        when: w.submitted_at,
      });
    }
  }

  // Timesheets and expenses, which already had approval screens but nothing
  // that told you they were waiting.
  const timesheets = await sql<{ id: number; staff: string; week_start: string; submitted_at: string }>`
    select t.id, u.full_name as staff, t.week_start, t.submitted_at
      from timesheets t join users u on u.id = t.user_id
     where t.status = 'submitted' and t.user_id <> ${me.id}
       and (${can(me, "timesheet.approve_any")} or u.manager_id = ${me.id})
     order by t.submitted_at`;
  for (const t of timesheets) {
    items.push({
      key: `timesheet:${t.id}`,
      kind: "timesheet",
      title: `${t.staff} — week of ${t.week_start}`,
      detail: "Timesheet submitted for approval",
      href: "/timesheets/approvals",
      action: "Review",
      when: t.submitted_at,
    });
  }

  if (can(me, "expense.approve")) {
    const expenses = await sql<{ id: number; ref: string; staff: string; description: string; amount: string; created_at: string }>`
      select e.id, e.ref, u.full_name as staff, e.description, e.amount, e.created_at
        from expenses e join users u on u.id = e.user_id
       where e.status in ('pending','awaiting_second') and e.user_id <> ${me.id}
       order by e.created_at
       limit 40`;
    for (const e of expenses) {
      items.push({
        key: `expense:${e.id}`,
        kind: "expense",
        title: `${e.staff} — ${e.description}`,
        detail: `${e.ref} · claim awaiting your decision`,
        href: `/finance/expenses/${e.id}`,
        action: "Decide",
        when: e.created_at,
      });
    }
  }

  return items.sort((a, b) => {
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    return (b.when ?? "").localeCompare(a.when ?? "");
  });
}

const verb = (ask: string) =>
  ask === "sign" ? "sign it" : ask === "approve" ? "approve it" : ask === "review" ? "review it" : "approve and sign it";
