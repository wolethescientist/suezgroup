import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money } from "@/lib/format";
import { Avatar, Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ProjectForm } from "@/components/erp-forms";
import { createProject } from "@/lib/actions/projects";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const me = await requireUser();

  const rows = await sql<{
    id: number; code: string | null; name: string; status: string; start_date: string | null; end_date: string | null;
    budget: string; currency: string; manager: string | null; manager_avatar: string | null;
    members: number; open_tasks: number; done_tasks: number;
  }>`
    select p.id, p.code, p.name, p.status, p.start_date, p.end_date, p.budget, p.currency,
           u.full_name as manager, u.avatar_url as manager_avatar,
           (select count(*) from project_members m where m.project_id = p.id)::int as members,
           (select count(*) from project_tasks t where t.project_id = p.id and t.status <> 'done')::int as open_tasks,
           (select count(*) from project_tasks t where t.project_id = p.id and t.status = 'done')::int as done_tasks
      from projects p
      left join users u on u.id = p.manager_id
     order by case p.status when 'active' then 0 when 'planning' then 1 when 'on_hold' then 2 else 3 end, p.name`;

  const [stats] = await sql<{ active: number; budget: string }>`
    select count(*) filter (where status = 'active')::int as active,
           coalesce(sum(budget) filter (where status in ('planning','active')), 0) as budget
      from projects`;

  const [users, departments, customers] = await Promise.all([
    sql<{ id: number; full_name: string }>`select id, full_name from users where status = 'active' order by full_name`,
    sql<{ id: number; name: string }>`select id, name from departments order by name`,
    sql<{ id: number; name: string }>`select id, name from customers where status <> 'closed' order by name limit 500`,
  ]);

  return (
    <>
      <PageHeader title="Projects" subtitle="Delivery work, who is on it, and how far along it is.">
        <ProjectForm action={createProject}
          users={users.map((u) => ({ id: u.id, label: u.full_name }))}
          departments={departments.map((d) => ({ id: d.id, label: d.name }))}
          companies={customers.map((customer) => ({ id: customer.id, label: customer.name }))} />
      </PageHeader>
      <Card className="mb-5"><p className="text-sm font-medium text-ink-soft"><strong>Projects</strong> are the delivery containers for work that has a clear outcome, owner, team, deadline, tasks, and (where relevant) customer or budget. Use them for installations, roll-outs, contracts, and internal initiatives — not everyday one-off requests.</p></Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Active projects" value={stats.active} />
        <Stat label="Committed budget" value={money(stats.budget)} tone="sky" />
        <Stat label="Projects on file" value={rows.length} tone="emerald" />
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No projects yet" hint="Create one, add the team, then track tasks against it." /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => {
            const total = p.open_tasks + p.done_tasks;
            const pct = total ? Math.round((p.done_tasks / total) * 100) : 0;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="card block p-5 card-hover">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold">{p.name}</h3>
                      <p className="mt-0.5 text-xs font-semibold text-ink-soft">
                        {p.code ? `${p.code} · ` : ""}{fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                      </p>
                    </div>
                    <Badge value={p.status} />
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs font-bold text-ink-soft">
                      <span>{p.done_tasks} of {total} task{total === 1 ? "" : "s"} done</span>
                      <span>{pct}%</span>
                    </div>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-canvas">
                      <span className="block h-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                      <Avatar name={p.manager ?? "?"} src={p.manager_avatar} size="sm" /> {p.manager ?? "No manager"}
                    </span>
                    <span className="text-xs font-bold tabular">{money(p.budget, p.currency)}</span>
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
