import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, titleCase } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { ActionForm, ConfirmBtn, Select, SubmitBtn } from "@/components/form";
import { ProjectForm, TaskForm } from "@/components/erp-forms";
import { addProjectMember, createTask, deleteTask, moveTask, removeProjectMember, updateProject } from "@/lib/actions/projects";
import { StatusSelect } from "@/components/status-select";

const COLUMNS = [
  ["todo", "To do"],
  ["in_progress", "In progress"],
  ["blocked", "Blocked"],
  ["done", "Done"],
] as const;

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ name: string }>`select name from projects where id = ${Number(id)}`;
  return { title: r ? r.name : "Not found" };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const projectId = Number(id);

  const [p] = await sql<{
    id: number; code: string | null; name: string; status: string; start_date: string | null; end_date: string | null;
    budget: string; currency: string; description: string | null; manager_id: number | null; manager: string | null;
    department: string | null; client: string | null;
  }>`
    select p.*, u.full_name as manager, d.name as department, c.name as client
      from projects p
      left join users u on u.id = p.manager_id
      left join departments d on d.id = p.department_id
      left join customers c on c.id = p.customer_id
     where p.id = ${projectId}`;
  if (!p) notFound();

  const [tasks, members, users, spent] = await Promise.all([
    sql<{ id: number; title: string; status: string; priority: string; due_date: string | null; assignee: string | null; assignee_avatar: string | null }>`
      select t.id, t.title, t.status, t.priority, t.due_date, u.full_name as assignee, u.avatar_url as assignee_avatar
        from project_tasks t left join users u on u.id = t.assignee_id
       where t.project_id = ${projectId}
       order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, t.due_date nulls last, t.id`,
    sql<{ user_id: number; full_name: string; avatar_url: string | null; role: string; job_title: string | null }>`
      select m.user_id, u.full_name, u.avatar_url, m.role, u.job_title
        from project_members m join users u on u.id = m.user_id
       where m.project_id = ${projectId} order by m.role, u.full_name`,
    sql<{ id: number; full_name: string }>`select id, full_name from users where status = 'active' order by full_name`,
    sql<{ hours: string; expenses: string }>`
      select coalesce((select sum(e.hours) from timesheet_entries e where e.project_id = ${projectId}), 0) as hours,
             coalesce((select sum(x.amount) from expenses x where x.project_id = ${projectId} and x.status in ('approved','reimbursed')), 0) as expenses`,
  ]);

  const userOpts = users.map((u) => ({ id: u.id, label: u.full_name }));

  return (
    <>
      <PageHeader title={p.name} subtitle={`${p.code ? `${p.code} · ` : ""}${p.client ?? p.department ?? "Internal"} · ${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}`}>
        <Badge value={p.status} />
        <ProjectForm action={updateProject} users={userOpts} departments={[]} companies={[]}
          project={{ id: p.id, name: p.name, status: p.status, manager_id: p.manager_id, start_date: p.start_date, end_date: p.end_date, budget: p.budget, description: p.description }} />
        <TaskForm action={createTask} projectId={p.id} users={userOpts} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Budget" value={money(p.budget, p.currency)} />
        <Stat label="Expenses booked" value={money(spent[0].expenses, p.currency)} tone="amber" />
        <Stat label="Hours logged" value={Number(spent[0].hours).toFixed(1)} tone="sky" />
        <Stat label="Team" value={members.length} tone="emerald" />
      </div>

      {p.description && <Card className="mb-5"><p className="text-sm font-medium whitespace-pre-wrap">{p.description}</p></Card>}

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        {COLUMNS.map(([key, label]) => {
          const col = tasks.filter((t) => t.status === key);
          return (
            <div key={key}>
              <p className="mb-2 px-1 text-[11px] font-bold tracking-wider text-ink-soft uppercase">{label} · {col.length}</p>
              <ul className="space-y-2">
                {col.map((t) => {
                  const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== "done";
                  return (
                    <li key={t.id} className="card p-3">
                      <p className="text-sm font-bold">{t.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
                        {t.priority !== "normal" && <Badge value={t.priority} />}
                        {overdue && <Badge value="overdue" label="Overdue" />}
                        {t.due_date ? fmtDate(t.due_date) : ""}
                      </p>
                      {t.assignee && (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
                          <Avatar name={t.assignee} src={t.assignee_avatar} size="sm" /> {t.assignee}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1">
                        <span className="flex-1">
                          <StatusSelect action={moveTask} id={t.id} value={t.status}
                                        options={COLUMNS.map(([k, l]) => [k, l] as [string, string])} />
                        </span>
                        <ActionForm action={deleteTask}>
                          <input type="hidden" name="id" value={t.id} />
                          <SubmitBtn variant="ghost" className="!px-2 !py-1 text-[11px]">×</SubmitBtn>
                        </ActionForm>
                      </div>
                    </li>
                  );
                })}
                {col.length === 0 && <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs font-semibold text-ink-soft">Nothing here</li>}
              </ul>
            </div>
          );
        })}
      </div>

      <Card>
        <CardTitle>Team</CardTitle>
        <ul className="mb-4 divide-y divide-line">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{m.full_name}</span>
                <span className="block truncate text-xs font-medium text-ink-soft">{m.job_title ?? titleCase(m.role)}</span>
              </span>
              <Badge value={m.role} />
              <ActionForm action={removeProjectMember}>
                <input type="hidden" name="project_id" value={p.id} />
                <input type="hidden" name="user_id" value={m.user_id} />
                <ConfirmBtn
                  title={`Remove ${m.full_name} from this project?`}
                  body="They lose access to the project board. Tasks already assigned to them stay assigned."
                  confirmLabel="Remove from project"
                >
                  Remove
                </ConfirmBtn>
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={addProjectMember} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="project_id" value={p.id} />
          <Select name="user_id" required className="field flex-1" defaultValue="">
            <option value="" disabled>Add someone…</option>
            {users.filter((u) => !members.some((m) => m.user_id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Select>
          <input name="role" placeholder="Role" defaultValue="member" className="field w-32" />
          <SubmitBtn>Add</SubmitBtn>
        </ActionForm>
      </Card>

      <Link href="/projects" className="mt-5 block text-xs font-bold text-brand-700 hover:underline">← All projects</Link>
    </>
  );
}
