import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Badge, BtnLink, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Workflow requests" };

const TABS = [
  ["inbox", "On my desk"],
  ["queue", "My department's queue"],
  ["raised", "Raised by me"],
  ["closed", "Closed"],
  ["all", "Everything"],
] as const;

type Row = {
  id: number; ref: string; title: string; category: string; priority: string; status: string;
  due_date: string | null; created_at: string; requester: string; assignee: string | null;
  requester_avatar: string | null; assignee_avatar: string | null; replies: number;
  department: string | null; on_behalf_of: string | null;
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const me = await requireUser();
  const { tab = "inbox", q = "" } = await searchParams;
  const like = `%${q}%`;

  const rows = await sql<Row>`
    select r.id, r.ref, r.title, r.category, r.priority, r.status, r.due_date, r.created_at,
           req.full_name as requester, req.avatar_url as requester_avatar,
           asg.full_name as assignee, asg.avatar_url as assignee_avatar,
           d.name as department, r.on_behalf_of,
           (select count(*) from workflow_comments c where c.request_id = r.id)::int as replies
      from workflow_requests r
      join users req on req.id = r.requester_id
      left join users asg on asg.id = r.assignee_id
      left join departments d on d.id = r.department_id
     where (${q} = '' or r.title ilike ${like} or r.description ilike ${like} or r.ref ilike ${like})
       and case ${tab}
             -- "On my desk" now includes what is waiting in my department's
             -- queue, because unclaimed work is nobody's desk and therefore
             -- everybody's until somebody picks it up.
             when 'inbox'  then r.status in ('pending','in_progress','awaiting_info')
                             and (r.assignee_id = ${me.id}
                                  or (r.assignee_id is null and r.department_id = ${me.department_id ?? 0}))
             when 'queue'  then r.assignee_id is null
                             and r.department_id = ${me.department_id ?? 0}
                             and r.status in ('pending','in_progress','awaiting_info')
             when 'raised' then r.requester_id = ${me.id}
             when 'closed' then (r.requester_id = ${me.id} or r.assignee_id = ${me.id})
                             and r.status in ('completed','rejected','cancelled')
             else ${can(me, "request.view_all")} or r.requester_id = ${me.id} or r.assignee_id = ${me.id}
                  or (r.assignee_id is null and r.department_id = ${me.department_id ?? 0})
           end
     order by case r.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
              r.due_date nulls last, r.created_at desc`;

  return (
    <>
      <PageHeader
        title="Workflow requests"
        subtitle="Ask a colleague — or a whole department — for a document, an approval or a task, and track it to a decision."
      >
        <BtnLink href="/api/export/workflow-requests" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <BtnLink href="/requests/new">
          <Icon name="plus" /> Raise a request
        </BtnLink>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
          {TABS.map(([key, label]) => (
            <Link
              key={key}
              href={`/requests?tab=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                tab === key ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="relative ml-auto">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="Search requests…" className="field pl-9 sm:w-64" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </form>
      </div>

      {rows.length === 0 ? (
        <Card>
          <Empty title="No requests here" hint="Raise one and it lands on your colleague's desk instantly.">
            <BtnLink href="/requests/new" variant="soft" className="mt-2">
              Raise a request
            </BtnLink>
          </Empty>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const overdue = r.due_date && new Date(r.due_date) < new Date() && ["pending", "in_progress", "awaiting_info"].includes(r.status);
            return (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="card block p-5 card-hover">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{r.title}</h3>
                        <Badge value={r.status} />
                        {r.priority !== "normal" && <Badge value={r.priority} />}
                        {overdue && <Badge value="overdue" label="Overdue" />}
                        {!r.assignee && <Badge value="pending" label="Unclaimed" />}
                      </div>
                      <p className="mt-1.5 text-xs font-semibold text-ink-soft">
                        {r.ref} · {titleCase(r.category)} · raised {timeAgo(r.created_at)}
                        {r.due_date ? ` · due ${fmtDate(r.due_date)}` : ""}
                        {r.replies > 0 ? ` · ${r.replies} update${r.replies === 1 ? "" : "s"}` : ""}
                        {r.on_behalf_of ? ` · for ${r.on_behalf_of}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">From</p>
                        <p className="text-xs font-bold">{r.requester}</p>
                      </div>
                      <Avatar name={r.requester} src={r.requester_avatar} size="sm" />
                      <span className="text-ink-soft" aria-hidden>
                        →
                      </span>
                      <Avatar name={r.assignee ?? r.department ?? "Queue"} src={r.assignee_avatar} size="sm" />
                      <div>
                        <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">
                          {r.assignee ? "To" : "Queue"}
                        </p>
                        <p className="text-xs font-bold">{r.assignee ?? r.department ?? "Unassigned"}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
