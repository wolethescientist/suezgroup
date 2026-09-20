import { Fragment } from "react";
import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, timeAgo } from "@/lib/format";
import { Avatar, Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { decideTimesheet } from "@/lib/actions/hr";

export const metadata = { title: "Timesheet approvals" };

export default async function ApprovalsPage() {
  const me = await requireUser();
  const isAdmin = can(me, "timesheet.approve_any");

  // A manager sees their own reports; HR and admin see everyone's.
  const rows = await sql<{
    id: number; week_start: string; status: string; submitted_at: string | null; total: string;
    who: string; who_avatar: string | null; billable: string;
  }>`
    select t.id, t.week_start, t.status, t.submitted_at,
           coalesce(sum(e.hours), 0) as total,
           coalesce(sum(e.hours) filter (where e.billable), 0) as billable,
           u.full_name as who, u.avatar_url as who_avatar
      from timesheets t
      join users u on u.id = t.user_id
      left join timesheet_entries e on e.timesheet_id = t.id
     where t.status = 'submitted'
       and t.user_id <> ${me.id}
       and (${isAdmin} or u.manager_id = ${me.id})
     group by t.id, u.full_name, u.avatar_url
     order by t.submitted_at`;

  // What the hours were actually spent on. An approver signing off billable time
  // — which may go on to a client invoice — needs to see the work, not a total.
  const lines = rows.length
    ? await sql<{ timesheet_id: number; work_date: string; hours: string; task: string | null; billable: boolean; project: string | null }>`
        select e.timesheet_id, e.work_date, e.hours, e.task, e.billable, p.name as project
          from timesheet_entries e
          left join projects p on p.id = e.project_id
         where e.timesheet_id = any(${rows.map((r) => r.id)}::int[])
         order by e.work_date`
    : [];
  const linesFor = (id: number) => lines.filter((l) => l.timesheet_id === id);

  return (
    <>
      <PageHeader title="Timesheet approvals" subtitle="Weeks your reports have sent for approval." />

      {rows.length === 0 ? (
        <Card><Empty title="Nothing waiting" hint="Submitted timesheets from your reports land here." /></Card>
      ) : (
        <Table head={["Employee", "Week", "Hours", "Billable", "Submitted", ""]}>
          {rows.map((r) => (
            <Fragment key={r.id}>
            <tr className="hover:bg-canvas">
              <Td><span className="flex items-center gap-2"><Avatar name={r.who} src={r.who_avatar} size="sm" />{r.who}</span></Td>
              <Td>{fmtDate(r.week_start)}</Td>
              <Td className="tabular font-bold">{Number(r.total).toFixed(2)}</Td>
              <Td className="tabular">{Number(r.billable).toFixed(2)}</Td>
              <Td className="text-xs">{r.submitted_at ? timeAgo(r.submitted_at) : "—"}</Td>
              <Td>
                {/* Separate forms — a submit button's name/value does not reach the action
                    across the server/client boundary. */}
                <span className="flex gap-1">
                  <ActionForm action={decideTimesheet}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <SubmitBtn>Approve</SubmitBtn>
                  </ActionForm>
                  <ActionForm action={decideTimesheet}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <SubmitBtn variant="ghost">Reject</SubmitBtn>
                  </ActionForm>
                </span>
              </Td>
            </tr>
            <tr className="border-b border-line">
              <td colSpan={6} className="px-4 pb-4">
                <details className="rounded-xl bg-canvas/70 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-bold text-ink-soft">
                    What {r.who.split(" ")[0]} worked on ({linesFor(r.id).length} day(s))
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {linesFor(r.id).map((l) => (
                      <li key={`${l.timesheet_id}-${l.work_date}`} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="w-24 shrink-0 font-semibold text-ink-soft tabular">{fmtDate(l.work_date)}</span>
                        <span className="tabular w-12 shrink-0 font-bold">{Number(l.hours).toFixed(2)}</span>
                        <span className="flex-1">{l.task || <span className="text-ink-soft">No description given</span>}</span>
                        {l.project && <Badge value={l.project} />}
                        {l.billable && <Badge value="billable" />}
                      </li>
                    ))}
                  </ul>
                </details>
              </td>
            </tr>
            </Fragment>
          ))}
        </Table>
      )}
      <Link href="/timesheets" className="mt-5 block text-xs font-bold text-brand-700 hover:underline">← My timesheets</Link>
    </>
  );
}
