"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { holdersOf, holdsCapability } from "@/lib/authority";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { saveUpload } from "@/lib/attachments";
import { workingDays, fmtDate } from "@/lib/format";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

/**
 * Who decides this person's leave.
 *
 * ponytail: HR's own leave went to their line manager, and where HR *is* the
 * line manager it went to HR — so the person who approves everyone's leave
 * approved their own department's, including their officers', and effectively
 * their own. The rule the company actually works to is that an approver's leave
 * goes above them: to the MD, the Chairman, or whoever else has been granted
 * "Approve an approver's own leave".
 *
 * Which people those are is not hardcoded here. It is whoever an administrator
 * has given `leave.approve_executive` to under Administration → Roles.
 */
async function approverFor(userId: number) {
  if (await holdsCapability(userId, "leave.approve_any")) {
    const executives = await holdersOf("leave.approve_executive");
    // An executive's own leave cannot go to themselves.
    const other = executives.find((e) => e.id !== userId);
    if (other) return other.id;
    // Nobody holds it yet, or the only holder is the applicant. Fall through to
    // the ordinary chain rather than leave the request with no approver at all;
    // decideLeave still refuses anyone who lacks the capability, so this cannot
    // become a way of self-approving.
  }

  const [row] = await sql<{ approver: number | null }>`
    select coalesce(
      (select manager_id from users where id = ${userId}),
      (select head_id from departments where name = 'Human Resources'),
      (select id from users where role = 'admin' order by id limit 1)
    ) as approver`;
  const approver = row?.approver ?? null;
  return approver === userId ? null : approver;
}

async function ensureBalance(userId: number, typeId: number, year: number) {
  await sql`
    insert into leave_balances (user_id, leave_type_id, year, entitled, used)
    select ${userId}, ${typeId}, ${year}, default_days, 0 from leave_types where id = ${typeId}
    on conflict do nothing`;
  const [row] = await sql<{ entitled: string; used: string }>`
    select entitled, used from leave_balances where user_id = ${userId} and leave_type_id = ${typeId} and year = ${year}`;
  return { entitled: Number(row?.entitled ?? 0), used: Number(row?.used ?? 0) };
}

export async function applyLeave(fd: FormData) {
  const me = await requireUser();
  const typeId = Number(str(fd, "leave_type_id"));
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  if (!typeId || !start || !end) return { error: "Pick a leave type and both dates." };
  if (end < start) return { error: "The end date cannot be before the start date." };

  const days = workingDays(start, end);
  if (days < 1) return { error: "That range contains no working days." };

  const year = new Date(start).getFullYear();
  const { entitled, used } = await ensureBalance(me.id, typeId, year);
  if (days > entitled - used)
    return { error: `You only have ${entitled - used} day(s) of that leave left for ${year}. This request needs ${days}.` };

  const [clash] = await sql<{ ref: string }>`
    select ref from leave_requests
     where user_id = ${me.id} and status in ('pending','approved')
       and daterange(start_date, end_date, '[]') && daterange(${start}::date, ${end}::date, '[]')
     limit 1`;
  if (clash) return { error: `Those dates overlap your existing request ${clash.ref}.` };

  let attachmentId: number | null = null;
  try {
    attachmentId = await saveUpload(fd.get("attachment"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const approver = await approverFor(me.id);
  const [req] = await sql<{ id: number; ref: string }>`
    insert into leave_requests (user_id, leave_type_id, start_date, end_date, days, reason, handover_to, approver_id, attachment_id)
    values (${me.id}, ${typeId}, ${start}, ${end}, ${days}, ${str(fd, "reason") || null},
            ${str(fd, "handover_to") ? Number(str(fd, "handover_to")) : null}, ${approver}, ${attachmentId})
    returning id, ref`;

  // One call, in the app and by email. ponytail: the email was a separate
  // hand-written sendMail here, which is why only leave and requests ever sent
  // one and everything else notified in-app only.
  await notify(
    [approver],
    "Leave request awaiting your approval",
    `${me.full_name} · ${days} day(s) from ${fmtDate(start)}`,
    `/leave/${req.id}`,
    {
      kind: "leave",
      entity: "leave_request",
      entityId: req.id,
      actionLabel: "Review the request",
      emailBody: `<p><strong>${me.full_name}</strong> has requested ${days} working day(s) of leave from ${fmtDate(start)} to ${fmtDate(end)}.</p>`,
    },
  );

  await audit(me.id, "leave.apply", "leave_request", req.id, { days });
  revalidatePath("/leave");
  redirect(`/leave/${req.id}`);
}

export async function decideLeave(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision"); // approved | rejected
  if (!["approved", "rejected"].includes(decision)) return { error: "Unknown decision." };

  const [req] = await sql<{
    id: number; ref: string; user_id: number; leave_type_id: number; days: string;
    start_date: string; end_date: string; status: string; manager_id: number | null; staff: string; staff_email: string;
  }>`
    select lr.id, lr.ref, lr.user_id, lr.leave_type_id, lr.days, lr.start_date, lr.end_date, lr.status,
           u.manager_id, u.full_name as staff, u.email as staff_email
      from leave_requests lr join users u on u.id = lr.user_id
     where lr.id = ${id}`;
  if (!req) return { error: "Request not found." };
  if (req.status !== "pending") return { error: `This request is already ${req.status}.` };

  if (req.user_id === me.id) return { error: "You cannot approve your own leave." };

  /**
   * An approver's leave needs an approver's approver.
   *
   * Checked here and not only in `approverFor`, because the approvals screen
   * lists anything a person with `leave.approve_any` could act on, and without
   * this two colleagues in HR could simply decide each other's.
   */
  if (await holdsCapability(req.user_id, "leave.approve_any")) {
    if (!can(me, "leave.approve_executive"))
      return {
        error:
          `${req.staff} approves other people's leave, so only an executive can decide theirs. ` +
          `Grant "Approve an approver's own leave" to the MD or Chairman's role under Administration → Roles.`,
      };
  } else if (!(can(me, "leave.approve_any") || req.manager_id === me.id)) {
    return { error: "You are not the approver for this request." };
  }

  await sql`
    update leave_requests
       set status = ${decision}, approver_id = ${me.id}, decided_at = now(), decision_note = ${str(fd, "note") || null}
     where id = ${id}`;

  if (decision === "approved") {
    const year = new Date(req.start_date).getFullYear();
    await ensureBalance(req.user_id, req.leave_type_id, year);
    await sql`
      update leave_balances set used = used + ${Number(req.days)}
       where user_id = ${req.user_id} and leave_type_id = ${req.leave_type_id} and year = ${year}`;
  }

  await notify(
    [req.user_id],
    `Leave ${decision}`,
    `${req.ref} — ${fmtDate(req.start_date)} to ${fmtDate(req.end_date)}`,
    `/leave/${id}`,
    {
      kind: "leave",
      entity: "leave_request",
      entityId: id,
      actionLabel: "Open the request",
      emailBody:
        `<p>${req.ref} · ${fmtDate(req.start_date)} to ${fmtDate(req.end_date)} (${Number(req.days)} day(s)).</p>` +
        `<p>Decided by ${me.full_name}.${str(fd, "note") ? ` Note: ${str(fd, "note")}` : ""}</p>`,
    },
  );

  await audit(me.id, `leave.${decision}`, "leave_request", id);
  revalidatePath("/leave");
  revalidatePath("/leave/approvals");
  revalidatePath(`/leave/${id}`);
  return { ok: true };
}

export async function cancelLeave(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [req] = await sql<{ user_id: number; status: string; days: string; leave_type_id: number; start_date: string }>`
    select user_id, status, days, leave_type_id, start_date from leave_requests where id = ${id}`;
  if (!req) return { error: "Request not found." };
  if (req.user_id !== me.id && !can(me, "leave.approve_any")) return { error: "You cannot cancel this request." };
  if (!["pending", "approved"].includes(req.status)) return { error: `Cannot cancel a ${req.status} request.` };

  await sql`update leave_requests set status = 'cancelled', decided_at = now() where id = ${id}`;
  if (req.status === "approved") {
    await sql`
      update leave_balances set used = greatest(0, used - ${Number(req.days)})
       where user_id = ${req.user_id} and leave_type_id = ${req.leave_type_id}
         and year = ${new Date(req.start_date).getFullYear()}`;
  }
  await audit(me.id, "leave.cancel", "leave_request", id);
  revalidatePath("/leave");
  revalidatePath(`/leave/${id}`);
  return { ok: true };
}
