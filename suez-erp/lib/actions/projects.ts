"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { canManageProject, isAdmin } from "@/lib/permissions";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

/**
 * Anyone signed in may create a project, but changing one is limited to its
 * manager, someone on the team, or an administrator — otherwise any employee
 * could retitle or reschedule delivery work they have nothing to do with.
 */
async function assertCanManage(projectId: number, me: { id: number; role: string }) {
  const [p] = await sql<{ manager_id: number | null }>`select manager_id from projects where id = ${projectId}`;
  if (!p) return "That project no longer exists.";
  const [member] = await sql<{ user_id: number }>`
    select user_id from project_members where project_id = ${projectId} and user_id = ${me.id}`;
  return canManageProject(me as never, p, !!member) ? null : "Only the project manager, its team or an administrator can change this project.";
}

/**
 * A project that ends before it starts is a typo, not a plan. Leave has always
 * checked this; projects and purchase orders did not, and the header rendered
 * "01 Oct 2026 -> 01 Mar 2026" quite happily.
 */
function datesOutOfOrder(fd: FormData) {
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  return start && end && end < start ? "The end date cannot be before the start date." : null;
}

export async function createProject(fd: FormData) {
  const me = await requireUser();
  const name = str(fd, "name");
  if (!name) return { error: "Give the project a name." };
  const badDates = datesOutOfOrder(fd);
  if (badDates) return { error: badDates };

  const [p] = await sql<{ id: number }>`
    insert into projects (code, name, customer_id, manager_id, department_id, status,
                          start_date, end_date, budget, currency, description)
    values (${str(fd, "code") || null}, ${name}, ${Number(str(fd, "customer_id")) || null},
            ${Number(str(fd, "manager_id")) || me.id}, ${Number(str(fd, "department_id")) || me.department_id},
            ${str(fd, "status") || "planning"}, ${str(fd, "start_date") || null}, ${str(fd, "end_date") || null},
            ${Number(str(fd, "budget") || 0)}, ${str(fd, "currency") || "NGN"}, ${str(fd, "description") || null})
    returning id`;

  await sql`insert into project_members (project_id, user_id, role) values (${p.id}, ${Number(str(fd, "manager_id")) || me.id}, 'manager') on conflict do nothing`;
  await audit(me.id, "project.create", "project", p.id, { name });
  revalidatePath("/projects");
  redirect(`/projects/${p.id}`);
}

export async function updateProject(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const denied = await assertCanManage(id, me);
  if (denied) return { error: denied };
  const badDates = datesOutOfOrder(fd);
  if (badDates) return { error: badDates };
  await sql`
    update projects set name = ${str(fd, "name")}, status = ${str(fd, "status")},
                        manager_id = ${Number(str(fd, "manager_id")) || null},
                        start_date = ${str(fd, "start_date") || null}, end_date = ${str(fd, "end_date") || null},
                        budget = ${Number(str(fd, "budget") || 0)}, description = ${str(fd, "description") || null}
     where id = ${id}`;
  await audit(me.id, "project.update", "project", id);
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function addProjectMember(fd: FormData) {
  const me = await requireUser();
  const projectId = Number(str(fd, "project_id"));
  const userId = Number(str(fd, "user_id"));
  if (!userId) return { error: "Pick someone to add." };
  const denied = await assertCanManage(projectId, me);
  if (denied) return { error: denied };
  await sql`
    insert into project_members (project_id, user_id, role) values (${projectId}, ${userId}, ${str(fd, "role") || "member"})
    on conflict (project_id, user_id) do update set role = excluded.role`;
  await notify([userId], "Added to a project", `You were added to a project by ${me.full_name}.`, `/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function removeProjectMember(fd: FormData) {
  const me = await requireUser();
  const projectId = Number(str(fd, "project_id"));
  const denied = await assertCanManage(projectId, me);
  if (denied) return { error: denied };
  await sql`delete from project_members where project_id = ${projectId} and user_id = ${Number(str(fd, "user_id"))}`;
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function createTask(fd: FormData) {
  const me = await requireUser();
  const projectId = Number(str(fd, "project_id"));
  const title = str(fd, "title");
  if (!title) return { error: "Give the task a title." };
  const denied = await assertCanManage(projectId, me);
  if (denied) return { error: denied };

  const assignee = Number(str(fd, "assignee_id")) || null;
  const [t] = await sql<{ id: number }>`
    insert into project_tasks (project_id, title, assignee_id, status, priority, due_date, estimate_hours, description)
    values (${projectId}, ${title}, ${assignee}, ${str(fd, "status") || "todo"}, ${str(fd, "priority") || "normal"},
            ${str(fd, "due_date") || null}, ${Number(str(fd, "estimate_hours")) || null}, ${str(fd, "description") || null})
    returning id`;

  if (assignee && assignee !== me.id)
    await notify([assignee], "Task assigned to you", title, `/projects/${projectId}`);
  await audit(me.id, "task.create", "task", t.id, { title });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function moveTask(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const status = str(fd, "status");
  if (!["todo", "in_progress", "blocked", "done"].includes(status)) return { error: "Unknown status." };
  const [own] = await sql<{ project_id: number }>`select project_id from project_tasks where id = ${id}`;
  if (!own) return { error: "That task no longer exists." };
  const denied = await assertCanManage(own.project_id, me);
  if (denied) return { error: denied };
  const [t] = await sql<{ project_id: number }>`update project_tasks set status = ${status} where id = ${id} returning project_id`;
  await audit(me.id, "task.move", "task", id, { status });
  if (t) revalidatePath(`/projects/${t.project_id}`);
  return { ok: true };
}

export async function deleteTask(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [own] = await sql<{ project_id: number }>`select project_id from project_tasks where id = ${id}`;
  if (!own) return { error: "That task no longer exists." };
  const denied = await assertCanManage(own.project_id, me);
  if (denied) return { error: denied };
  const [t] = await sql<{ project_id: number }>`delete from project_tasks where id = ${id} returning project_id`;
  await audit(me.id, "task.delete", "task", id);
  if (t) revalidatePath(`/projects/${t.project_id}`);
  return { ok: true };
}
