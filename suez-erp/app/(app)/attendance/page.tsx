import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtTime } from "@/lib/format";
import { BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ClockCard } from "@/components/attendance-clock";
import { clockIn, clockOut } from "@/lib/actions/attendance";

export const metadata = { title: "Attendance" };

const hhmm = (minutes: number | null) => {
  if (minutes == null) return "—";
  const m = Math.max(0, minutes);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/**
 * Everyone's own attendance: the clock, and what it has recorded.
 *
 * ponytail: there was nowhere in the system to record that somebody turned up.
 * Timesheets say what the week was spent on, which is a different question and
 * one nobody fills in daily — so the only record of attendance was a paper book
 * on the front desk, which is exactly what this is meant to replace.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = sp.from || monthStart;
  const to = sp.to || today;

  const [open] = await sql<{ id: number; clocked_in_at: string }>`
    select id, clocked_in_at from attendance_entries
     where user_id = ${me.id} and clocked_out_at is null`;

  const rows = await sql<{
    id: number; work_date: string; clocked_in_at: string; clocked_out_at: string | null;
    minutes: number | null; in_note: string | null; out_note: string | null;
  }>`
    select id, work_date, clocked_in_at, clocked_out_at, minutes, in_note, out_note
      from attendance_entries
     where user_id = ${me.id} and work_date between ${from}::date and ${to}::date
     order by clocked_in_at desc`;

  const totalMinutes = rows.reduce((s, r) => s + (r.minutes ?? 0), 0);
  const daysPresent = new Set(rows.map((r) => r.work_date)).size;
  const todayMinutes = rows.filter((r) => r.work_date === today).reduce((s, r) => s + (r.minutes ?? 0), 0);

  return (
    <>
      <PageHeader title="Attendance" subtitle="Clock in when you arrive and out when you leave. HR reads the register, not your diary.">
        {can(me, "attendance.view_all") && <BtnLink href="/attendance/register" variant="ghost">Company register</BtnLink>}
      </PageHeader>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <ClockCard
          openSince={open?.clocked_in_at ?? null}
          clockInAction={clockIn}
          clockOutAction={clockOut}
        />

        <div className="grid content-start gap-4 sm:grid-cols-3">
          <Stat label="Recorded today" value={hhmm(todayMinutes)} />
          <Stat label="Days present" value={daysPresent} tone="emerald" hint={`${fmtDate(from)} – ${fmtDate(to)}`} />
          <Stat label="Hours in period" value={hhmm(totalMinutes)} tone="sky" />
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          From
          <input type="date" name="from" defaultValue={from} className="field" />
        </label>
        <label className="grid gap-1 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          To
          <input type="date" name="to" defaultValue={to} className="field" />
        </label>
        <button type="submit" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">Show</button>
        <a
          href={`/api/export/attendance?from=${from}&to=${to}&me=1`}
          className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold hover:bg-line/40"
        >
          Download CSV
        </a>
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty title="Nothing recorded in that period" hint="Clock in above and today's entry will appear here." />
        </Card>
      ) : (
        <Table head={["Date", "In", "Out", "Hours", "Note"]}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <Td className="font-bold">{fmtDate(r.work_date)}</Td>
              <Td className="tabular">{fmtTime(r.clocked_in_at)}</Td>
              <Td className="tabular">
                {r.clocked_out_at ? fmtTime(r.clocked_out_at) : <span className="font-bold text-emerald-700">still in</span>}
              </Td>
              <Td className="tabular font-bold">{hhmm(r.minutes)}</Td>
              <Td className="text-xs text-ink-soft">{[r.in_note, r.out_note].filter(Boolean).join(" · ") || "—"}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
