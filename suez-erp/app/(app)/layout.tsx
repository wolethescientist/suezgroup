import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOrg } from "@/lib/settings";
import { Shell } from "@/components/shell";
import { NAV } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const org = await getOrg();
  const isAdmin = can(user, "people.view_all");
  const isFinance = can(user, "expense.approve");
  const isBuyer = can(user, "requisition.approve");

  /**
   * Sidebar badges. Memos, timesheets, expenses and procurement were missing —
   * an urgent policy could sit unsigned and a submitted timesheet could sit on a
   * manager's desk with nothing anywhere to say so.
   */
  const [counts] = await sql<{
    leave: number; requests: number; messages: number; notifications: number; mail: number;
    memos: number; timesheets: number; expenses: number; procurement: number;
    attendance: number; reports: number;
  }>`
    select
      (select count(*) from leave_requests lr
         join users u on u.id = lr.user_id
        where lr.status = 'pending'
          and (${isAdmin} or u.manager_id = ${user.id} or lr.user_id = ${user.id}))::int as leave,
      (select count(*) from workflow_requests
        where status in ('pending','in_progress','awaiting_info')
          and (assignee_id = ${user.id}
            -- Unclaimed work sitting in your own department's queue is yours to
            -- see; that is the whole point of the queue.
            or (assignee_id is null and department_id = ${user.department_id ?? 0})))::int as requests,
      (select count(*) from messages m
         join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${user.id}
        where m.sender_id <> ${user.id}
          and (cm.last_read_at is null or m.created_at > cm.last_read_at))::int as messages,
      (select count(*) from notifications where user_id = ${user.id} and read_at is null)::int as notifications,
      (select count(*) from mail_messages mm
         join mail_accounts ma on ma.id = mm.account_id
        where ma.user_id = ${user.id} and mm.folder = 'INBOX' and not mm.seen)::int as mail,
      (select count(*) from memo_recipients mr
         join memos m on m.id = mr.memo_id
        where mr.user_id = ${user.id} and m.status = 'published'
          and (mr.read_at is null or (m.requires_ack and mr.acknowledged_at is null)))::int as memos,
      (select count(*) from timesheets t
         join users u on u.id = t.user_id
        where t.status = 'submitted' and t.user_id <> ${user.id}
          and (${isAdmin} or u.manager_id = ${user.id}))::int as timesheets,
      (select count(*) from expenses e
        where (e.user_id = ${user.id} and e.status in ('pending','awaiting_second'))
           or (${isFinance} and e.user_id <> ${user.id} and e.status in ('pending','awaiting_second')))::int as expenses,
      -- A clocked-in session shows a dot on Attendance until it is closed.
      (select count(*) from attendance_entries
        where user_id = ${user.id} and clocked_out_at is null)::int as attendance,
      (select count(*) from staff_reports r
        where r.status = 'submitted' and r.user_id <> ${user.id}
          and ${can(user, "report.view_all")})::int as reports,
      (select count(*) from purchase_requisitions pr
        where pr.status = 'pending'
          and pr.requester_id <> ${user.id}
          and (${isBuyer}
            or pr.department_id in (select id from departments where head_id = ${user.id})))::int as procurement`;

  // The sidebar's Inbox badge counts unread notifications; the page itself also
  // shows what is outstanding, which cannot be marked away.
  const withInbox = { ...counts, inbox: counts.notifications };

  const notes = await sql<{ id: number; title: string; body: string | null; href: string | null; created_at: string }>`
    select id, title, body, href, created_at
      from notifications
     where user_id = ${user.id}
     order by read_at nulls first, created_at desc
     limit 6`;

  return (
    <Shell
      user={user}
      org={org.name}
      product="ERP"
      groups={NAV}
      counts={withInbox}
      notes={notes}
      searchPlaceholder="Search people, memos, requests…"
    >
      {children}
    </Shell>
  );
}
