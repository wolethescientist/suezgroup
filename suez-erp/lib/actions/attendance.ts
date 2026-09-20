"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

/**
 * The caller's address, for the attendance record.
 *
 * Attendance is the one place a person's claim about where they were is worth
 * something, so the address the clock-in arrived from is kept beside it. It is
 * evidence, not enforcement: nothing here blocks anyone on the strength of it.
 */
async function callerIp() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim() || null;
}

/** Today in the organisation's own day, not the server's. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function clockIn(fd: FormData) {
  const me = await requireUser();
  const note = str(fd, "note") || null;

  const [open] = await sql<{ id: number }>`
    select id from attendance_entries where user_id = ${me.id} and clocked_out_at is null`;
  if (open) return { error: "You are already clocked in. Clock out first." };

  const [row] = await sql<{ id: number }>`
    insert into attendance_entries (user_id, work_date, clocked_in_at, in_note, in_ip)
    values (${me.id}, ${today()}, now(), ${note}, ${await callerIp()})
    returning id`;

  await audit(me.id, "attendance.clock_in", "attendance", row.id);
  await notify([me.id], "Clocked in", "Your arrival has been recorded.", "/attendance", {
    kind: "attendance",
    entity: "attendance",
    entityId: row.id,
    actionLabel: "View attendance",
  });
  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true, message: "Clocked in." };
}

export async function clockOut(fd: FormData) {
  const me = await requireUser();
  const note = str(fd, "note") || null;

  // The minute count is written here rather than derived on read, so the
  // register and the CSV cannot disagree about the same day.
  const [row] = await sql<{ id: number; minutes: number }>`
    update attendance_entries
       set clocked_out_at = now(),
           out_note = ${note},
           out_ip = ${await callerIp()},
           minutes = greatest(0, round(extract(epoch from (now() - clocked_in_at)) / 60))::int
     where user_id = ${me.id} and clocked_out_at is null
    returning id, minutes`;
  if (!row) return { error: "You are not clocked in." };

  await audit(me.id, "attendance.clock_out", "attendance", row.id, { minutes: row.minutes });
  await notify([me.id], "Clocked out", `${hhmm(row.minutes)} recorded for today.`, "/attendance", {
    kind: "attendance",
    entity: "attendance",
    entityId: row.id,
    actionLabel: "View attendance",
  });
  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true, message: `Clocked out — ${hhmm(row.minutes)} recorded.` };
}

const hhmm = (minutes: number | null) => {
  const m = Math.max(0, minutes ?? 0);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/**
 * HR's correction, for the clock-out somebody forgot on their way out of the
 * building. The reason is required and goes to the audit trail, because an
 * attendance record that can be changed silently is not worth keeping.
 */
export async function amendAttendance(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "attendance.amend")) return { error: "You cannot amend attendance records." };

  const id = Number(str(fd, "id"));
  const reason = str(fd, "reason");
  const inAt = str(fd, "clocked_in_at");
  const outAt = str(fd, "clocked_out_at");
  if (!id) return { error: "Which record?" };
  if (!reason) return { error: "Say why the record is being changed." };
  if (!inAt) return { error: "A clock-in time is required." };
  if (outAt && outAt < inAt) return { error: "The clock-out cannot be before the clock-in." };

  const [before] = await sql<{ user_id: number; clocked_in_at: string; clocked_out_at: string | null }>`
    select user_id, clocked_in_at, clocked_out_at from attendance_entries where id = ${id}`;
  if (!before) return { error: "Record not found." };

  const [row] = await sql<{ id: number; user_id: number; work_date: string }>`
    update attendance_entries
       set clocked_in_at  = ${inAt}::timestamptz,
           clocked_out_at = ${outAt || null}::timestamptz,
           minutes = case when ${outAt || null}::timestamptz is null then null
                          else greatest(0, round(extract(epoch from (${outAt || null}::timestamptz - ${inAt}::timestamptz)) / 60))::int
                     end,
           out_note = trim(both ' ' from coalesce(out_note, '') || ' [amended: ' || ${reason} || ']')
     where id = ${id}
    returning id, user_id, work_date`;

  await audit(me.id, "attendance.amend", "attendance", id, {
    reason,
    from: { in: before.clocked_in_at, out: before.clocked_out_at },
    to: { in: inAt, out: outAt || null },
  });
  await notify(
    [row.user_id],
    "Your attendance record was corrected",
    `${row.work_date} — ${reason}`,
    "/attendance",
    { kind: "attendance", entity: "attendance", entityId: id, email: true },
  );
  revalidatePath("/attendance");
  revalidatePath("/attendance/register");
  return { ok: true, message: "Record amended." };
}

/** Closes a session somebody left open overnight, so the register is not misleading. */
export async function closeOpenSession(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "attendance.amend")) return { error: "You cannot amend attendance records." };
  const id = Number(str(fd, "id"));
  const [row] = await sql<{ id: number; user_id: number }>`
    update attendance_entries
       set clocked_out_at = clocked_in_at,
           minutes = 0,
           out_note = trim(both ' ' from coalesce(out_note, '') || ' [closed without a clock-out]')
     where id = ${id} and clocked_out_at is null
    returning id, user_id`;
  if (!row) return { error: "That session is already closed." };
  await audit(me.id, "attendance.close_open", "attendance", id);
  revalidatePath("/attendance/register");
  return { ok: true, message: "Session closed with no hours recorded." };
}
