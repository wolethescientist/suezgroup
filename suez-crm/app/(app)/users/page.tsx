import { can, requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Badge, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Dialog } from "@/components/form";
import { Icon } from "@/components/icons";
import { ResetPasswordForm, UserForm } from "@/components/user-forms";

export const metadata = { title: "Users" };

/**
 * The people who use the CRM.
 *
 * ponytail: this screen did not exist. The CRM read `users` for owners,
 * assignees and reporting lines, and offered no way to add somebody, change
 * their access or suspend them — that meant editing the database, or doing it
 * in the ERP and hoping the two agreed.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireCap("people.manage");
  const q = (await searchParams).q?.trim() ?? "";
  const like = `%${q}%`;

  const [rows, managers, roles] = await Promise.all([
    sql<{
      id: number; full_name: string; email: string; staff_no: string | null; job_title: string | null;
      role: string; status: string; phone: string | null; manager_id: number | null; manager: string | null;
      avatar_url: string | null; last_login_at: string | null; owns: number;
    }>`
      select u.id, u.full_name, u.email, u.staff_no, u.job_title, u.role, u.status, u.phone,
             u.manager_id, m.full_name as manager, u.avatar_url, u.last_login_at,
             (select count(*) from crm_deals d where d.owner_id = u.id and d.stage not in ('won','lost'))::int as owns
        from users u
        left join users m on m.id = u.manager_id
       where ${q === ""} or u.full_name ilike ${like} or u.email ilike ${like} or u.staff_no ilike ${like}
       order by u.full_name`,
    sql<{ id: number; name: string }>`
      select id, full_name as name from users where status = 'active' order by full_name`,
    sql<{ key: string; name: string; description: string | null }>`
      select key, name, description from roles order by is_builtin desc, name`,
  ]);

  const active = rows.filter((r) => r.status === "active").length;

  return (
    <>
      <PageHeader title="Users" subtitle="Who uses the CRM, what they can do, and what they are carrying.">
        <Dialog label={<><Icon name="plus" /> Add user</>} title="Add user" width="max-w-xl">
          <UserForm managers={managers} roles={roles} canGrantAdmin={can(me, "roles.manage")} />
        </Dialog>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Users" value={rows.length} />
        <Stat label="Active" value={active} tone="emerald" />
        <Stat label="Roles in use" value={new Set(rows.map((r) => r.role)).size} tone="sky" />
      </div>

      <form className="mb-4">
        <div className="relative sm:max-w-xs">
          <input name="q" defaultValue={q} placeholder="Search name, email or staff number…" className="field pl-9" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </div>
      </form>

      {rows.length === 0 ? (
        <Card><Empty title={q ? "Nobody matches that" : "No users yet"} hint={q ? "Try a shorter term." : "Add your first user."} /></Card>
      ) : (
        <Table head={["User", "Role", "Reports to", "Open deals", "Last sign-in", "Status", ""]}>
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-canvas">
              <Td>
                <span className="flex items-center gap-2">
                  <Avatar name={u.full_name} src={u.avatar_url} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{u.full_name}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      {u.job_title ? `${u.job_title} · ` : ""}{u.email}
                    </span>
                  </span>
                </span>
              </Td>
              <Td><Badge value={u.role} label={roles.find((r) => r.key === u.role)?.name ?? titleCase(u.role)} /></Td>
              <Td className="text-xs">{u.manager ?? <span className="text-ink-soft">—</span>}</Td>
              <Td className="tabular">{u.owns > 0 ? u.owns : <span className="text-ink-soft">0</span>}</Td>
              <Td className="text-xs">
                {u.last_login_at ? (
                  <>
                    {timeAgo(u.last_login_at)}
                    <span className="block text-ink-soft">{fmtDateTime(u.last_login_at)}</span>
                  </>
                ) : (
                  <span className="text-ink-soft">Never</span>
                )}
              </Td>
              <Td><Badge value={u.status} /></Td>
              <Td>
                <span className="flex gap-1">
                  <Dialog label="Edit" variant="outline" title={`Edit ${u.full_name}`} width="max-w-xl">
                    <UserForm managers={managers} roles={roles} record={u} canGrantAdmin={can(me, "roles.manage")} />
                  </Dialog>
                  <Dialog label="Password" variant="ghost" title={`Reset password — ${u.full_name}`}>
                    <ResetPasswordForm user={u} />
                  </Dialog>
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Card className="mt-5">
        <p className="text-xs font-medium text-ink-soft">
          Suspending somebody stops them signing in but leaves their accounts, opportunities and quotes intact and
          still owned by them — reassign that work before they leave, or it stays where it is.
        </p>
      </Card>
    </>
  );
}
