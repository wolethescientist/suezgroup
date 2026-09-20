import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { titleCase } from "@/lib/format";
import { Avatar, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Staff directory" };

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string }> }) {
  await requireUser();
  const { q = "", dept = "" } = await searchParams;
  const like = `%${q}%`;

  const [people, departments] = await Promise.all([
    sql<{
      id: number; full_name: string; job_title: string | null; email: string; phone: string | null;
      avatar_url: string | null; department: string | null; role: string; manager: string | null; away: boolean;
    }>`
      select u.id, u.full_name, u.job_title, u.email, u.phone, u.avatar_url, u.role,
             d.name as department, m.full_name as manager,
             exists (
               select 1 from leave_requests lr
                where lr.user_id = u.id and lr.status = 'approved'
                  and current_date between lr.start_date and lr.end_date
             ) as away
        from users u
        left join departments d on d.id = u.department_id
        left join users m on m.id = u.manager_id
       where u.status = 'active'
         and (${q} = '' or u.full_name ilike ${like} or u.job_title ilike ${like} or u.email ilike ${like})
         and (${dept} = '' or d.name = ${dept})
       order by u.full_name`,
    sql<{ name: string; n: number }>`
      select d.name, count(u.id)::int as n
        from departments d left join users u on u.department_id = d.id and u.status = 'active'
       group by d.name order by d.name`,
  ]);

  return (
    <>
      <PageHeader title="Staff directory" subtitle={`${people.length} colleague${people.length === 1 ? "" : "s"} — reach anyone in one click.`} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form className="relative">
          {dept && <input type="hidden" name="dept" value={dept} />}
          <input name="q" defaultValue={q} placeholder="Search name, role or email…" className="field pl-9 sm:w-72" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/directory${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold ${!dept ? "bg-brand-500 text-on-brand" : "bg-surface text-ink-soft ring-1 ring-line ring-inset hover:bg-canvas"}`}
          >
            All
          </Link>
          {departments.map((d) => (
            <Link
              key={d.name}
              href={`/directory?dept=${encodeURIComponent(d.name)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                dept === d.name ? "bg-brand-500 text-on-brand" : "bg-surface text-ink-soft ring-1 ring-line ring-inset hover:bg-canvas"
              }`}
            >
              {d.name} <span className="opacity-60">{d.n}</span>
            </Link>
          ))}
        </div>
      </div>

      {people.length === 0 ? (
        <Card>
          <Empty title="Nobody matches" hint="Try a different name or department." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <Avatar name={p.full_name} src={p.avatar_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{p.full_name}</h3>
                    {p.away && <Badge value="pending" label="On leave" />}
                    {p.role !== "staff" && <Badge value={p.role} label={titleCase(p.role)} />}
                  </div>
                  <p className="text-xs font-semibold text-ink-soft">{p.job_title ?? "Staff"}</p>
                  <p className="text-xs font-medium text-ink-soft">{p.department ?? "No department"}</p>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                <div className="flex gap-2">
                  <dt className="text-ink-soft">Email</dt>
                  <dd className="min-w-0 flex-1 truncate text-right font-semibold">
                    <a href={`mailto:${p.email}`} className="text-brand-700 hover:underline">
                      {p.email}
                    </a>
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-soft">Phone</dt>
                  <dd className="flex-1 text-right font-semibold">{p.phone ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-soft">Reports to</dt>
                  <dd className="flex-1 truncate text-right font-semibold">{p.manager ?? "—"}</dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/requests/new?to=${p.id}`}
                  className="flex-1 rounded-xl bg-brand-50 px-3 py-2 text-center text-xs font-bold text-brand-700 hover:bg-brand-100"
                >
                  Request something
                </Link>
                <Link
                  href={`/messages/new?to=${p.id}`}
                  className="rounded-xl border border-line px-3 py-2 text-center text-xs font-bold hover:bg-canvas"
                >
                  Message
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
