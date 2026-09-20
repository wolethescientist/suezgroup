import { can, requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, timeAgo, titleCase } from "@/lib/format";
import { Dialog } from "@/components/form";
import { BalanceForm, ResetPasswordForm, UserForm } from "@/components/admin-forms";
import { Avatar, Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Employees" };

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string }> }) {
  const me = await requireCap("people.manage");
  const { q = "", dept = "" } = await searchParams;
  const like = `%${q}%`;
  const year = new Date().getFullYear();

  const [rows, departments, managers, types, balances, roles] = await Promise.all([
    sql<any>`
      select u.*, d.name as department, m.full_name as manager
        from users u
        left join departments d on d.id = u.department_id
        left join users m on m.id = u.manager_id
       where (${q} = '' or u.full_name ilike ${like} or u.email ilike ${like} or u.staff_no ilike ${like})
         and (${dept} = '' or d.id = ${dept === "" ? null : Number(dept)})
       order by u.full_name`,
    sql<{ id: number; name: string }>`select id, name from departments order by name`,
    sql<{ id: number; name: string }>`select id, full_name as name from users where status = 'active' order by full_name`,
    sql<{ id: number; name: string }>`select id, name from leave_types order by name`,
    sql<{ user_id: number; leave_type_id: number; entitled: string; used: string }>`
      select user_id, leave_type_id, entitled, used from leave_balances where year = ${year}`,
    // Roles are data, so the access-level dropdown reads them rather than
    // hardcoding the six the system happened to ship with.
    sql<{ key: string; name: string; description: string | null }>`
      select key, name, description from roles order by is_builtin desc, name`,
  ]);

  const active = rows.filter((r: any) => r.status === "active").length;

  return (
    <>
      <PageHeader title="Employees" subtitle="Staff records, access levels, reporting lines and leave entitlements.">
        <BtnLink href="/api/export/employees" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <Dialog label={<><Icon name="plus" /> Add employee</>} title="Add employee" width="max-w-xl">
          <UserForm departments={departments} managers={managers} roles={roles} canGrantAdmin={can(me, "roles.manage")} />
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Employees" value={rows.length} hint={`${active} active`} />
        <Stat label="Departments" value={departments.length} hint="Cost centres" tone="sky" />
        <Stat label="Roles in use" value={new Set(rows.map((r: any) => r.role)).size} hint="Across the company" tone="amber" />
        <Stat label="Signatures on file" value={rows.filter((r: any) => r.signature).length} hint="Can acknowledge policies" tone="emerald" />
      </div>

      <form className="my-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <input name="q" defaultValue={q} placeholder="Search name, email or staff no…" className="field pl-9 sm:w-72" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </div>
        <select name="dept" defaultValue={dept} className="field sm:w-52">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-brand-50 px-3.5 py-2 text-sm font-bold text-brand-700 hover:bg-brand-100">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty title="No employees match" hint="Clear the filters or add a new staff record." />
        </Card>
      ) : (
        <Table head={["Employee", "Department", "Reports to", "Access", "Status", "Last seen", ""]}>
          {rows.map((u: any) => (
            <tr key={u.id} className="hover:bg-canvas">
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={u.full_name} src={u.avatar_url} size="md" />
                  <div className="min-w-0">
                    <p className="font-bold">{u.full_name}</p>
                    <p className="truncate text-xs font-medium text-ink-soft">
                      {u.staff_no ? `${u.staff_no} · ` : ""}
                      {u.email}
                    </p>
                  </div>
                </div>
              </Td>
              <Td>
                <p className="font-semibold">{u.department ?? "—"}</p>
                <p className="text-xs font-medium text-ink-soft">{u.job_title ?? "—"}</p>
              </Td>
              <Td className="text-ink-soft">{u.manager ?? "HR"}</Td>
              <Td>
                <Badge value={u.role} label={roles.find((r) => r.key === u.role)?.name ?? titleCase(u.role)} />
              </Td>
              <Td>
                <Badge value={u.status} />
              </Td>
              <Td className="text-xs text-ink-soft">{u.last_login_at ? timeAgo(u.last_login_at) : `Added ${fmtDate(u.created_at)}`}</Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Dialog label="Leave" variant="ghost" className="!px-2 !py-1 !text-xs" title={`${u.full_name} — leave balances`} description={`Year ${year}`}>
                    <BalanceForm
                      user={u}
                      types={types}
                      balances={balances.filter((b) => b.user_id === u.id)}
                    />
                  </Dialog>
                  <Dialog label="Password" variant="ghost" className="!px-2 !py-1 !text-xs" title={`Reset password — ${u.full_name}`}>
                    <ResetPasswordForm user={u} />
                  </Dialog>
                  <Dialog label="Edit" variant="ghost" className="!px-2 !py-1 !text-xs !text-brand-700" title={`Edit ${u.full_name}`} width="max-w-xl">
                    <UserForm departments={departments} managers={managers} roles={roles} record={u} canGrantAdmin={can(me, "roles.manage")} />
                  </Dialog>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
