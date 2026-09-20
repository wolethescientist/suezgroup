"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, requireCap, requireUser } from "@/lib/auth";
import { isSelfApproval } from "@/lib/permissions";
import { audit, notify } from "@/lib/audit";
import { hoursAreSane, MAX_HOURS_PER_DAY, mondayOf } from "@/lib/weeks";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();



/* ------------------------------------------------------------- timesheets */

async function openSheet(userId: number, weekStart: string) {
  await sql`
    insert into timesheets (user_id, week_start) values (${userId}, ${weekStart})
    on conflict (user_id, week_start) do nothing`;
  const [ts] = await sql<{ id: number; status: string }>`
    select id, status from timesheets where user_id = ${userId} and week_start = ${weekStart}`;
  return ts;
}

/**
 * Replaces the whole week in one go: the grid posts every cell, so deleting the
 * existing rows and re-inserting is both simpler and correct when a day is cleared.
 */
export async function saveTimesheet(fd: FormData) {
  const me = await requireUser();
  const weekStart = mondayOf(str(fd, "week_start") || new Date().toISOString().slice(0, 10));
  const ts = await openSheet(me.id, weekStart);
  if (ts.status === "approved") return { error: "That week is approved and can no longer be edited." };

  const dates = fd.getAll("entry_date").map((v) => v.toString());
  const hours = fd.getAll("entry_hours").map((v) => Number(v.toString() || 0));
  const projects = fd.getAll("entry_project").map((v) => Number(v.toString() || 0) || null);
  const tasks = fd.getAll("entry_task").map((v) => v.toString().trim());
  const billable = fd.getAll("entry_billable").map((v) => v.toString() === "on" || v.toString() === "true");

  const rows = dates
    .map((d, i) => ({ d, h: hours[i] || 0, p: projects[i] ?? null, t: tasks[i] ?? "", b: billable[i] ?? false }))
    .filter((r) => r.d && r.h > 0);
  if (!hoursAreSane(rows.map((r) => r.h))) return { error: `A day cannot hold more than ${MAX_HOURS_PER_DAY} hours.` };

  await sql`delete from timesheet_entries where timesheet_id = ${ts.id}`;
  for (const r of rows) {
    await sql`
      insert into timesheet_entries (timesheet_id, work_date, hours, project_id, task, billable)
      values (${ts.id}, ${r.d}, ${r.h}, ${r.p}, ${r.t || null}, ${r.b})`;
  }
  await sql`update timesheets set status = 'draft', note = ${str(fd, "note") || null} where id = ${ts.id}`;
  await audit(me.id, "timesheet.save", "timesheet", ts.id, { weekStart, days: rows.length });

  // "Submit for approval" posts the same grid, so the week on screen is always
  // what gets sent — never an empty sheet the user thought they had filled in.
  if (str(fd, "intent") === "submit") return submitTimesheet(fd);

  revalidatePath("/timesheets");
  return { ok: true, message: "Saved." };
}

export async function submitTimesheet(fd: FormData) {
  const me = await requireUser();
  const weekStart = mondayOf(str(fd, "week_start"));
  const ts = await openSheet(me.id, weekStart);

  const [{ total }] = await sql<{ total: string }>`
    select coalesce(sum(hours), 0) as total from timesheet_entries where timesheet_id = ${ts.id}`;
  if (Number(total) <= 0) return { error: "There are no hours on this week to submit." };

  const [row] = await sql<{ approver: number | null }>`
    select coalesce((select manager_id from users where id = ${me.id}),
                    (select id from users where role = 'admin' order by id limit 1)) as approver`;

  await sql`
    update timesheets set status = 'submitted', submitted_at = now(), approver_id = ${row?.approver ?? null}
     where id = ${ts.id}`;
  if (row?.approver)
    await notify([row.approver], "Timesheet submitted", `${me.full_name} submitted ${total} hours for week of ${weekStart}.`, "/timesheets/approvals");
  await audit(me.id, "timesheet.submit", "timesheet", ts.id);
  revalidatePath("/timesheets");
  return { ok: true, message: `Sent for approval — ${Number(total)} hour(s).` };
}

export async function decideTimesheet(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision");
  if (!["approved", "rejected"].includes(decision)) return { error: "Unknown decision." };

  const [ts] = await sql<{ user_id: number; week_start: string; status: string; manager_id: number | null }>`
    select t.user_id, t.week_start, t.status, u.manager_id
      from timesheets t join users u on u.id = t.user_id where t.id = ${id}`;
  if (!ts) return { error: "That timesheet no longer exists." };
  if (ts.status !== "submitted") return { error: `That timesheet is already ${ts.status}.` };
  // Approving your own week, or someone who does not report to you, is not allowed.
  if (ts.user_id === me.id) return { error: "You cannot approve your own timesheet." };
  if (!can(me, "timesheet.approve_any") && ts.manager_id !== me.id)
    return { error: "Only that employee's line manager, HR or an administrator can decide this." };

  await sql`update timesheets set status = ${decision}, decided_at = now(), approver_id = ${me.id} where id = ${id}`;
  await notify([ts.user_id], `Timesheet ${decision}`, `Week of ${ts.week_start}.`, "/timesheets");
  await audit(me.id, `timesheet.${decision}`, "timesheet", id);
  revalidatePath("/timesheets/approvals");
  revalidatePath("/timesheets");
  return { ok: true };
}

/* -------------------------------------------------------------- appraisals */

export async function createCycle(fd: FormData) {
  const me = await requireCap("appraisal.cycle");
  const name = str(fd, "name");
  if (!name) return { error: "Name the review cycle." };
  const [c] = await sql<{ id: number }>`
    insert into appraisal_cycles (name, period_start, period_end)
    values (${name}, ${str(fd, "period_start")}, ${str(fd, "period_end")}) returning id`;

  // Open one appraisal per active employee, reviewed by their line manager.
  await sql`
    insert into appraisals (cycle_id, user_id, reviewer_id)
    select ${c.id}, u.id, u.manager_id from users u where u.status = 'active'
    on conflict (cycle_id, user_id) do nothing`;

  const staff = await sql<{ id: number }>`select id from users where status = 'active'`;
  await notify(staff.map((s) => s.id), "Appraisal cycle opened", `${name} — complete your self-review.`, "/appraisals");
  await audit(me.id, "cycle.create", "cycle", c.id, { name });
  revalidatePath("/appraisals");
  return { ok: true };
}

export async function saveSelfReview(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [a] = await sql<{ user_id: number; status: string }>`select user_id, status from appraisals where id = ${id}`;
  if (!a || a.user_id !== me.id) return { error: "That is not your appraisal." };
  if (a.status === "acknowledged") return { error: "That appraisal is closed." };

  const score = Number(str(fd, "self_score")) || null;
  if (score !== null && (score < 1 || score > 5)) return { error: "Score yourself between 1 and 5." };

  await sql`
    update appraisals set self_review = ${str(fd, "self_review") || null}, self_score = ${score},
                          status = case when status = 'pending' then 'self_done' else status end
     where id = ${id}`;
  await audit(me.id, "appraisal.self", "appraisal", id);
  revalidatePath(`/appraisals/${id}`);
  return { ok: true, message: "Self-review saved." };
}

/**
 * The manager's half of an appraisal.
 *
 * Two things this did not do before: it let a reviewer score someone who had not
 * yet written their self-assessment — jumping pending straight to reviewed and
 * skipping the employee's own account of the year — and, because admin and HR
 * bypass the reviewer check, it would happily have let someone review
 * themselves. Both are closed here; HR can still waive the self-review
 * deliberately with `waive_self`.
 */
export async function saveReviewerReview(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [a] = await sql<{ reviewer_id: number | null; user_id: number; status: string }>`
    select reviewer_id, user_id, status from appraisals where id = ${id}`;
  if (!a) return { error: "That appraisal no longer exists." };
  if (a.reviewer_id !== me.id && !can(me, "appraisal.cycle"))
    return { error: "Only the assigned reviewer, HR or an administrator can write this." };
  if (isSelfApproval(me, a.user_id)) return { error: "You cannot write the reviewer's half of your own appraisal." };
  if (a.status === "acknowledged") return { error: "That appraisal is closed." };
  if (a.status === "pending" && fd.get("waive_self") !== "on")
    return {
      error: "Ask them to complete their self-review first. HR can waive that if it is being skipped deliberately.",
    };

  const score = Number(str(fd, "reviewer_score")) || null;
  if (score !== null && (score < 1 || score > 5)) return { error: "Score between 1 and 5." };

  await sql`
    update appraisals set reviewer_review = ${str(fd, "reviewer_review") || null}, reviewer_score = ${score}, status = 'reviewed'
     where id = ${id}`;
  const [row] = await sql<{ user_id: number }>`select user_id from appraisals where id = ${id}`;
  await notify([row.user_id], "Your appraisal has been reviewed", null, `/appraisals/${id}`);
  await audit(me.id, "appraisal.review", "appraisal", id);
  revalidatePath(`/appraisals/${id}`);
  return { ok: true, message: "Review saved." };
}

export async function acknowledgeAppraisal(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [a] = await sql<{ user_id: number; status: string }>`select user_id, status from appraisals where id = ${id}`;
  if (!a || a.user_id !== me.id) return { error: "That is not your appraisal." };
  if (a.status !== "reviewed") return { error: "There is nothing to acknowledge yet." };
  await sql`update appraisals set status = 'acknowledged' where id = ${id}`;
  await audit(me.id, "appraisal.acknowledge", "appraisal", id);
  revalidatePath(`/appraisals/${id}`);
  return { ok: true };
}

export async function saveGoal(fd: FormData) {
  const me = await requireUser();
  const appraisalId = Number(str(fd, "appraisal_id"));
  const title = str(fd, "title");
  if (!title) return { error: "Give the goal a title." };
  await sql`
    insert into appraisal_goals (appraisal_id, title, weight, progress, notes)
    values (${appraisalId}, ${title}, ${Number(str(fd, "weight")) || 20},
            ${Number(str(fd, "progress")) || 0}, ${str(fd, "notes") || null})`;
  await audit(me.id, "goal.create", "appraisal", appraisalId);
  revalidatePath(`/appraisals/${appraisalId}`);
  return { ok: true };
}

export async function updateGoal(fd: FormData) {
  await requireUser();
  const id = Number(str(fd, "id"));
  const [g] = await sql<{ appraisal_id: number }>`
    update appraisal_goals set progress = ${Number(str(fd, "progress")) || 0} where id = ${id} returning appraisal_id`;
  if (g) revalidatePath(`/appraisals/${g.appraisal_id}`);
  return { ok: true };
}

/* ----------------------------------------------------------- announcements */

export async function postAnnouncement(fd: FormData) {
  const me = await requireCap("announcement.post");
  const title = str(fd, "title");
  const body = str(fd, "body");
  if (!title || !body) return { error: "An announcement needs a title and a body." };

  const audience = str(fd, "audience") || "all";
  const deptId = audience === "department" ? Number(str(fd, "department_id")) || null : null;
  if (audience === "department" && !deptId) return { error: "Pick the department this is for." };

  const [a] = await sql<{ id: number }>`
    insert into announcements (title, body, category, priority, pinned, audience, department_id, publish_at, expires_at, author_id)
    values (${title}, ${body}, ${str(fd, "category") || "general"}, ${str(fd, "priority") || "normal"},
            ${fd.get("pinned") === "on"}, ${audience}, ${deptId},
            ${str(fd, "publish_at") || new Date().toISOString()}, ${str(fd, "expires_at") || null}, ${me.id})
    returning id`;

  const recipients = deptId
    ? await sql<{ id: number }>`select id from users where status = 'active' and department_id = ${deptId}`
    : await sql<{ id: number }>`select id from users where status = 'active'`;
  await notify(recipients.map((r) => r.id).filter((id) => id !== me.id), `Announcement: ${title}`, body.slice(0, 140), `/announcements`);

  await audit(me.id, "announcement.post", "announcement", a.id, { title });
  revalidatePath("/announcements");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteAnnouncement(fd: FormData) {
  const me = await requireCap("announcement.manage");
  const id = Number(str(fd, "id"));
  await sql`delete from announcements where id = ${id}`;
  await audit(me.id, "announcement.delete", "announcement", id);
  revalidatePath("/announcements");
  return { ok: true };
}
