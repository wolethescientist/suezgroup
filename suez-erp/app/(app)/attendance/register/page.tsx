import Link from "next/link";
import { can, requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtTime } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { AmendAttendance } from "@/components/attendance-amend";
import { amendAttendance, closeOpenSession } from "@/lib/actions/attendance";

export const metadata = { title: "Attendance register" };

const hhmm = (minutes: number | null) => {
  if (minutes == null) return "—";
  const m = Math.max(0, minutes);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/**
 * The company attendance register — HR's view of who was in, when, and for how
 * long, with the CSV they actually work from.
 */
export default async function AttendanceRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; user?: string; dept?: string }>;
}) {
  const me = await requireCap("attendance.view_all");
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const from = sp.from || `${today.slice(0, 7)}-01`;
  const to = sp.to || today;
  const userId = Number(sp.user) || 0;
  const deptId = Number(sp.dept) || 0;

  const [rows, people, departments] = await Promise.all([
    sql<{
      id: number; user_id: number; full_name: string; staff_no: string | null; department: string | null;
      work_date: string; clocked_in_at: string; clocked_out_at: string | null; minutes: number | null;
      in_note: string | null; out_note: string | null;
    }>`
      select a.id, a.user_id, u.full_name, u.staff_no, d.name as department,
             a.work_date, a.clocked_in_at, a.clocked_out_at, a.minutes, a.in_note, a.out_note
        from attendance_entries a
        join users u on u.id = a.user_id
        left join departments d on d.id = u.department_id
       where a.work_date between ${from}::date and ${to}::date
         and (${userId} = 0 or a.user_id = ${userId})
         and (${deptId} = 0 or u.department_id = ${deptId})
       order by a.work_date desc, u.full_name, a.clocked_in_at`,
    sql<{ id: number; full_name: string }>`
      select id, full_name from users where status = 'active' order by full_name`,
    sql<{ id: number; name: string }>`select id, name from departments order by name`,
  ]);

  const totalMinutes = rows.reduce((s, r) => s + (r.minutes ?? 0), 0);
  const stillIn = rows.filter((r) => !r.clocked_out_at);
  const presentToday = new Set(rows.filter((r) => r.work_date === today).map((r) => r.user_id)).size;

  const query = new URLSearchParams({
    from,
    to,
    ...(userId ? { user: String(userId) } : {}),
    ...(deptId ? { dept: String(deptId) } : {}),
  }).toString();

  return (
    <>
      <PageHeader title="Attendance register" subtitle="Who was in, when they arrived, and when they left.">
        <Link href="/attendance" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold hover:bg-line/40">
          My attendance
        </Link>
        <a
          href={`/api/export/attendance?${query}`}
          className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-on-brand hover:bg-brand-700"
        >
          Download CSV
        </a>
      </PageHeader>

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Stat label="In today" value={presentToday} tone="emerald" />
        <Stat label="Entries" value={rows.length} />
        <Stat label="Hours in period" value={hhmm(totalMinutes)} tone="sky" />
        <Stat label="Still clocked in" value={stillIn.length} tone={stillIn.length ? "amber" : "brand"} />
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
        <label className="grid gap-1 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          Department
          <select name="dept" defaultValue={String(deptId || "")} className="field">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          Employee
          <select name="user" defaultValue={String(userId || "")} className="field">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">Apply</button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty title="Nothing recorded in that period" hint="Widen the dates, or check that staff have started clocking in." />
        </Card>
      ) : (
        <Table head={["Employee", "Date", "In", "Out", "Hours", "Note", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <Td className="font-bold">
                {r.full_name}
                <span className="block text-[11px] font-semibold text-ink-soft">
                  {[r.staff_no, r.department].filter(Boolean).join(" · ") || "—"}
                </span>
              </Td>
              <Td className="tabular">{fmtDate(r.work_date)}</Td>
              <Td className="tabular">{fmtTime(r.clocked_in_at)}</Td>
              <Td className="tabular">
                {r.clocked_out_at ? fmtTime(r.clocked_out_at) : <Badge value="open" label="still in" />}
              </Td>
              <Td className="tabular font-bold">{hhmm(r.minutes)}</Td>
              <Td className="max-w-[16rem] text-xs text-ink-soft">
                {[r.in_note, r.out_note].filter(Boolean).join(" · ") || "—"}
              </Td>
              <Td>
                {can(me, "attendance.amend") && (
                  <span className="flex gap-1">
                    <AmendAttendance action={amendAttendance} entry={r} />
                    {!r.clocked_out_at && (
                      <ActionForm action={closeOpenSession}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitBtn variant="ghost">Close</SubmitBtn>
                      </ActionForm>
                    )}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
