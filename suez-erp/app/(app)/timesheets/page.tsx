import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { mondayOf, shiftWeeks as shift } from "@/lib/weeks";
import { Badge, BtnLink, Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { TimesheetGrid, SubmitWeek } from "@/components/timesheet-grid";
import { saveTimesheet } from "@/lib/actions/hr";

export const metadata = { title: "Timesheets" };



export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const me = await requireUser();
  const { week } = await searchParams;
  const weekStart = mondayOf(week || new Date().toISOString().slice(0, 10));

  const [sheet] = await sql<{ id: number; status: string; submitted_at: string | null }>`
    select id, status, submitted_at from timesheets where user_id = ${me.id} and week_start = ${weekStart}`;

  const entries = sheet
    ? await sql<{ work_date: string; hours: string; project_id: number | null; task: string | null; billable: boolean }>`
        select work_date, hours, project_id, task, billable from timesheet_entries where timesheet_id = ${sheet.id} order by work_date`
    : [];

  const [projects, recent] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from projects where status in ('planning','active') order by name`,
    sql<{ week_start: string; status: string; total: string }>`
      select t.week_start, t.status, coalesce(sum(e.hours), 0) as total
        from timesheets t left join timesheet_entries e on e.timesheet_id = t.id
       where t.user_id = ${me.id} group by t.week_start, t.status
       order by t.week_start desc limit 8`,
  ]);

  const total = entries.reduce((s, e) => s + Number(e.hours), 0);
  const locked = sheet?.status === "approved" || sheet?.status === "submitted";
  const canApprove = can(me, "timesheet.approve_any") || me.role === "manager";

  return (
    <>
      <PageHeader title="Timesheets" subtitle="Log your hours a week at a time and send them to your line manager.">
        {canApprove && <BtnLink href="/timesheets/approvals" variant="ghost">Approvals</BtnLink>}
        {!locked && <SubmitWeek />}
      </PageHeader>
      <Card className="mb-5"><CardTitle>What this is for</CardTitle><p className="text-sm font-medium text-ink-soft">A timesheet is a weekly record of how your work time was spent — especially by project, task, and billable work. It helps managers plan capacity, verify project effort, and approve the week. It is not an attendance clock: Attendance records when you arrived; a timesheet records what you worked on.</p></Card>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href={`/timesheets?week=${shift(weekStart, -1)}`} className="rounded-xl bg-surface px-3 py-1.5 text-xs font-bold ring-1 ring-line ring-inset hover:bg-canvas">← Previous</Link>
        <p className="text-sm font-bold">Week of {fmtDate(weekStart)}</p>
        <Link href={`/timesheets?week=${shift(weekStart, 1)}`} className="rounded-xl bg-surface px-3 py-1.5 text-xs font-bold ring-1 ring-line ring-inset hover:bg-canvas">Next →</Link>
        {sheet && <Badge value={sheet.status} />}
        <Link href="/timesheets" className="ml-auto text-xs font-bold text-brand-700 hover:underline">This week</Link>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Hours this week" value={total.toFixed(2)} />
        <Stat label="Status" value={sheet ? sheet.status.replace("_", " ") : "not started"} tone="sky" />
        <Stat label="Billable" value={entries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hours), 0).toFixed(2)} tone="emerald" />
      </div>

      {locked && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset">
          This week has been {sheet!.status} and can no longer be edited.
        </p>
      )}

      <TimesheetGrid
        saveAction={saveTimesheet}
        weekStart={weekStart}
        entries={entries}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        locked={locked}
      />

      {recent.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Recent weeks</CardTitle>
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.week_start} className="flex items-center gap-3 py-2.5 text-sm">
                <Link href={`/timesheets?week=${r.week_start.slice(0, 10)}`} className="flex-1 font-semibold text-brand-700 hover:underline">
                  Week of {fmtDate(r.week_start)}
                </Link>
                <span className="tabular font-bold">{Number(r.total).toFixed(2)} h</span>
                <Badge value={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
