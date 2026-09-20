import Link from "next/link";
import { can, canAny, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { compactMoney, fmtDate, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Badge, BtnLink, Card, CardTitle, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Dashboard" };

const hello = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default async function Dashboard() {
  const me = await requireUser();
  const isAdmin = can(me, "leave.approve_any");
  const canSeeFinance = can(me, "invoice.manage");

  const [[totals], memos, approvals, assigned, onLeave, invoices, tasks] = await Promise.all([
    sql<{
      unread_memos: number; open_requests: number; leave_left: string; pending_approvals: number;
      active_projects: number; unsigned_memos: number; timesheets_waiting: number;
    }>`
      select
        (select count(*) from memo_recipients mr join memos m on m.id = mr.memo_id
          where mr.user_id = ${me.id} and mr.read_at is null and m.status = 'published')::int as unread_memos,
        (select count(*) from workflow_requests
          where status in ('pending','in_progress','awaiting_info')
            and (assignee_id = ${me.id}
                 or (assignee_id is null and department_id = ${me.department_id ?? 0})))::int as open_requests,
        -- Annual-style leave only. This used to filter on lt.paid, and every
        -- leave type is paid, so the tile added Maternity's 90 days to Sick,
        -- Study and Compassionate and told the Managing Director she had 155
        -- days remaining. Maternity is paid; it is not a balance you draw down.
        -- accrues marks the types that genuinely are.
        (select coalesce(sum(entitled - used), 0) from leave_balances lb
           join leave_types lt on lt.id = lb.leave_type_id
          where lb.user_id = ${me.id} and lb.year = extract(year from now()) and lt.accrues) as leave_left,
        (select count(*) from leave_requests lr join users u on u.id = lr.user_id
          where lr.status = 'pending' and (${isAdmin} or u.manager_id = ${me.id}))::int as pending_approvals,
        (select count(*) from projects where status = 'active')::int as active_projects,
        (select count(*) from memo_recipients mr join memos m on m.id = mr.memo_id
          where mr.user_id = ${me.id} and m.status = 'published'
            and m.requires_ack and mr.acknowledged_at is null)::int as unsigned_memos,
        (select count(*) from timesheets t join users u on u.id = t.user_id
          where t.status = 'submitted' and t.user_id <> ${me.id}
            and (${isAdmin} or u.manager_id = ${me.id}))::int as timesheets_waiting`,

    sql<{ id: number; ref: string; kind: string; title: string; priority: string; published_at: string; author: string; read_at: string | null; requires_ack: boolean; acknowledged_at: string | null }>`
      select m.id, m.ref, m.kind, m.title, m.priority, m.published_at, m.requires_ack,
             mr.read_at, mr.acknowledged_at, u.full_name as author
        from memo_recipients mr
        join memos m on m.id = mr.memo_id
        join users u on u.id = m.author_id
       where mr.user_id = ${me.id} and m.status = 'published'
       order by mr.read_at nulls first, m.published_at desc
       limit 5`,

    sql<{ id: number; ref: string; days: string; start_date: string; end_date: string; staff: string; type: string }>`
      select lr.id, lr.ref, lr.days, lr.start_date, lr.end_date, u.full_name as staff, lt.name as type
        from leave_requests lr
        join users u on u.id = lr.user_id
        join leave_types lt on lt.id = lr.leave_type_id
       where lr.status = 'pending' and (${isAdmin} or u.manager_id = ${me.id})
       order by lr.created_at
       limit 5`,

    sql<{ id: number; ref: string; title: string; status: string; priority: string; due_date: string | null; requester: string }>`
      select r.id, r.ref, r.title, r.status, r.priority, r.due_date, u.full_name as requester
        from workflow_requests r
        join users u on u.id = r.requester_id
       where r.status in ('pending','in_progress','awaiting_info')
         and (r.assignee_id = ${me.id}
              or (r.assignee_id is null and r.department_id = ${me.department_id ?? 0}))
       order by r.due_date nulls last
       limit 5`,

    sql<{ full_name: string; avatar_url: string | null; type: string; start_date: string; end_date: string }>`
      select u.full_name, u.avatar_url, lt.name as type, lr.start_date, lr.end_date
        from leave_requests lr
        join users u on u.id = lr.user_id
        join leave_types lt on lt.id = lr.leave_type_id
       where lr.status = 'approved'
         and lr.end_date >= current_date and lr.start_date <= current_date + 7
       order by lr.start_date
       limit 6`,

    sql<{ id: number; ref: string; total: string; currency: string; customer: string | null; due_date: string | null }>`
      select i.id, i.ref, i.total, i.currency, c.name as customer, i.due_date
        from invoices i
        left join customers c on c.id = i.customer_id
       where i.kind = 'sales' and i.status not in ('paid','void')
       order by i.due_date nulls last, i.total desc
       limit 5`,

    sql<{ id: number; title: string; status: string; priority: string; due_date: string | null; project: string }>`
      select t.id, t.title, t.status, t.priority, t.due_date, p.name as project
        from project_tasks t
        join projects p on p.id = t.project_id
       where t.assignee_id = ${me.id} and t.status <> 'done'
       order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
                t.due_date nulls last
       limit 5`,
  ]);

  return (
    <>
      <PageHeader title={`${hello()}, ${me.full_name.split(" ")[0]}`} subtitle={`${me.job_title ?? titleCase(me.role)}${me.department ? ` · ${me.department}` : ""}`}>
        <BtnLink href="/requests/new" variant="outline">
          <Icon name="plus" /> New request
        </BtnLink>
        <BtnLink href="/leave/new">
          <Icon name="calendar" /> Apply for leave
        </BtnLink>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.unsigned_memos > 0 ? (
          <Stat label="Awaiting your signature" value={totals.unsigned_memos}
                hint="Policies you must acknowledge" tone="rose" />
        ) : (
          <Stat label="Unread circulars" value={totals.unread_memos} hint="Addressed to you" tone="brand" />
        )}
        <Stat label="Requests on your desk" value={totals.open_requests} hint="Awaiting your action" tone="amber" />
        <Stat label="Annual leave remaining" value={`${Number(totals.leave_left)} days`}
              hint={`${new Date().getFullYear()} entitlement`} tone="emerald" />
        {totals.timesheets_waiting > 0 ? (
          <Stat label="Timesheets to approve" value={totals.timesheets_waiting} hint="Sent by your reports" tone="sky" />
        ) : !canAny(me, "leave.approve_any", "timesheet.approve_any") && me.role !== "manager" ? (
          <Stat label="Active projects" value={totals.active_projects} hint="Company-wide" tone="sky" />
        ) : (
          <Stat label="Leave approvals" value={totals.pending_approvals} hint="Pending your decision" tone="rose" />
        )}
      </div>

      {/* items-start: grid children stretch to the tallest by default, which left
          the shorter column as a card with a hand-span of empty white below its
          content. Each card should be as tall as what is in it. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle action={<Link href="/memos" className="text-xs font-bold text-brand-700 hover:underline">View all</Link>}>
              Memos &amp; circulars for you
            </CardTitle>
            {memos.length === 0 ? (
              <Empty title="No circulars yet" hint="Anything published to your department will appear here." />
            ) : (
              <ul className="-mx-1 divide-y divide-line">
                {memos.map((m) => (
                  <li key={m.id}>
                    <Link href={`/memos/${m.id}`} className="flex items-start gap-3 rounded-xl px-1 py-3 hover:bg-canvas">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.read_at ? "bg-line" : "bg-brand-500"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`truncate text-sm ${m.read_at ? "font-semibold" : "font-bold"}`}>{m.title}</span>
                          <Badge value={m.kind} />
                          {m.priority !== "normal" && <Badge value={m.priority} />}
                          {m.requires_ack && !m.acknowledged_at && <Badge value="pending" label="Sign required" />}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-ink-soft">
                          {m.ref} · {m.author} · {timeAgo(m.published_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle action={<Link href="/requests" className="text-xs font-bold text-brand-700 hover:underline">View all</Link>}>
              Requests assigned to you
            </CardTitle>
            {assigned.length === 0 ? (
              <Empty title="Nothing on your desk" hint="Colleagues' document and approval requests land here." />
            ) : (
              <ul className="-mx-1 divide-y divide-line">
                {assigned.map((r) => {
                  const overdue = r.due_date && new Date(r.due_date) < new Date();
                  return (
                    <li key={r.id}>
                      <Link href={`/requests/${r.id}`} className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-canvas">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{r.title}</span>
                          <span className="mt-0.5 block text-xs font-medium text-ink-soft">
                            {r.ref} · from {r.requester} · due {fmtDate(r.due_date)}
                          </span>
                        </span>
                        <Badge value={overdue ? "overdue" : r.status} label={overdue ? "Overdue" : undefined} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Finance's card. Staff were shown it and then bounced from the page. */}
          {canSeeFinance && (
            <Card>
              <CardTitle action={<Link href="/finance/invoices" className="text-xs font-bold text-brand-700 hover:underline">View invoices</Link>}>
                Outstanding sales invoices
              </CardTitle>
              {invoices.length === 0 ? (
                <Empty title="No outstanding invoices" hint="Open sales invoices will appear here." />
              ) : (
                <ul className="-mx-1 divide-y divide-line">
                  {invoices.map((invoice) => (
                    <li key={invoice.id}>
                      <Link href={`/finance/invoices/${invoice.id}`} className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-canvas">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{invoice.ref}</span>
                          <span className="mt-0.5 block text-xs font-medium text-ink-soft">
                            {invoice.customer ?? "No customer"} · due {fmtDate(invoice.due_date)}
                          </span>
                        </span>
                        <span className="text-sm font-bold tabular">{compactMoney(invoice.total, invoice.currency)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {approvals.length > 0 && (
            <Card>
              <CardTitle action={<Link href="/leave/approvals" className="text-xs font-bold text-brand-700 hover:underline">Review</Link>}>
                Awaiting your approval
              </CardTitle>
              <ul className="space-y-3">
                {approvals.map((a) => (
                  <li key={a.id}>
                    <Link href={`/leave/${a.id}`} className="block rounded-xl bg-canvas p-3 hover:bg-brand-50">
                      <p className="text-sm font-bold">{a.staff}</p>
                      <p className="mt-0.5 text-xs font-medium text-ink-soft">
                        {a.type} · {Number(a.days)} day{Number(a.days) === 1 ? "" : "s"} · {fmtDate(a.start_date)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardTitle>Away this week</CardTitle>
            {onLeave.length === 0 ? (
              <p className="py-2 text-sm font-medium text-ink-soft">Everyone is in. 🎉</p>
            ) : (
              <ul className="space-y-3">
                {onLeave.map((p, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{p.full_name}</span>
                      <span className="block text-xs font-medium text-ink-soft">
                        {p.type} · {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle action={<Link href="/projects" className="text-xs font-bold text-brand-700 hover:underline">All projects</Link>}>
              Your project tasks
            </CardTitle>
            {tasks.length === 0 ? (
              <p className="py-2 text-sm font-medium text-ink-soft">No open project tasks.</p>
            ) : (
              <ul className="space-y-3">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon name="check" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{task.title}</span>
                      <span className="block text-xs font-medium text-ink-soft">
                        {task.project} · due {fmtDate(task.due_date)} · {titleCase(task.priority)} priority
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="bg-gradient-to-br from-brand-500 to-brand-400 text-ink">
            <p className="text-sm font-bold">Quick actions</p>
            <div className="mt-3 grid gap-2">
              {[
                ["Write a memo or circular", "/memos/new"],
                ["Request a document", "/requests/new"],
                ["Apply for leave", "/leave/new"],
                ["Log time for this week", "/timesheets"],
                ["Set up your signature", "/settings/signature"],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between rounded-xl bg-surface/45 px-3 py-2 text-xs font-bold backdrop-blur transition hover:bg-surface/70"
                >
                  {label} <span aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
