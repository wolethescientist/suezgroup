import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Avatar, Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, Dialog } from "@/components/form";
import { Icon } from "@/components/icons";
import { RoleForm } from "@/components/role-form";
import { deleteRole } from "@/lib/actions/admin";
import { CAPABILITIES, capability } from "@/lib/capabilities";

export const metadata = { title: "Roles & access" };

/**
 * Who can do what.
 *
 * ponytail: neither this screen nor a user-management screen existed in the
 * CRM — it inherited four hardcoded role names from the ERP and no way to see
 * or change either. Roles are data now; the capability list they draw from is
 * still code, because the code is what enforces it.
 */
export default async function RolesPage() {
  await requireCap("roles.manage");

  const roles = await sql<{
    key: string; name: string; description: string | null; is_builtin: boolean;
    capabilities: string[]; holders: number;
  }>`
    select r.key, r.name, r.description, r.is_builtin,
           coalesce((select array_agg(rp.capability order by rp.capability)
                       from role_permissions rp where rp.role_key = r.key), '{}') as capabilities,
           (select count(*)::int from users u where u.role = r.key and u.status = 'active') as holders
      from roles r
     order by r.is_builtin desc, r.name`;

  const people = await sql<{ role: string; full_name: string; avatar_url: string | null }>`
    select role, full_name, avatar_url from users where status = 'active' order by full_name`;

  const unassigned = CAPABILITIES.filter(
    (c) => !roles.some((r) => r.capabilities.includes(c.key)),
  );

  return (
    <>
      <PageHeader title="Roles & access" subtitle="Every role, what it can do, and who holds it.">
        <Dialog label={<><Icon name="plus" /> New role</>} title="New role" width="max-w-2xl"
                description="Give it a name, then tick what it may do. Nothing is granted by default.">
          <RoleForm />
        </Dialog>
      </PageHeader>

      {unassigned.length > 0 && (
        <Card className="mb-5 !bg-amber-50 ring-1 ring-amber-200 ring-inset">
          <p className="text-sm font-bold text-amber-900">
            {unassigned.length} capabilit{unassigned.length === 1 ? "y is" : "ies are"} held by no role
          </p>
          <p className="mt-1 text-xs font-medium text-amber-900">
            Nobody in the company can currently: {unassigned.map((c) => c.label.toLowerCase()).join(", ")}.
          </p>
        </Card>
      )}

      <div className="space-y-4">
        {roles.map((r) => {
          const holders = people.filter((p) => p.role === r.key);
          return (
            <Card key={r.key}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold">{r.name}</h2>
                    <span className="rounded-lg bg-canvas px-2 py-0.5 font-mono text-[11px] font-bold text-ink-soft">
                      {r.key}
                    </span>
                    {r.is_builtin && <Badge value="built-in" label="Built-in" />}
                  </div>
                  {r.description && <p className="mt-1 text-sm font-medium text-ink-soft">{r.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Dialog label="Edit" variant="outline" title={`Edit ${r.name}`} width="max-w-2xl"
                          description="Changes take effect the next time each person loads a page.">
                    <RoleForm record={r} />
                  </Dialog>
                  {!r.is_builtin && (
                    <ActionForm action={deleteRole}>
                      <input type="hidden" name="key" value={r.key} />
                      <ConfirmBtn
                        title={`Delete ${r.name}?`}
                        body={
                          r.holders > 0
                            ? `${r.holders} employee(s) still hold this role — move them first.`
                            : "Nobody holds this role, so removing it affects no one."
                        }
                        confirmLabel="Delete role"
                        confirmWord={r.name}
                      >
                        Delete
                      </ConfirmBtn>
                    </ActionForm>
                  )}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
                <div>
                  <p className="mb-2 text-[11px] font-bold tracking-wider text-ink-soft uppercase">
                    Can do ({r.capabilities.length})
                  </p>
                  {r.capabilities.length === 0 ? (
                    <p className="text-sm font-medium text-ink-soft">
                      Ownership only — they work the accounts, deals and quotes assigned to them.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {r.capabilities.map((key) => (
                        <li key={key}
                            className="rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-800">
                          {capability(key)?.label ?? key}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-bold tracking-wider text-ink-soft uppercase">
                    Held by ({r.holders})
                  </p>
                  {holders.length === 0 ? (
                    <p className="text-sm font-medium text-ink-soft">Nobody yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {holders.map((p) => (
                        <li key={p.full_name} className="flex items-center gap-2 text-sm font-semibold">
                          <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                          {p.full_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {roles.length === 0 && (
        <Card><Empty title="No roles defined" hint="Something has gone wrong — the built-in roles should always be here." /></Card>
      )}

      <Card className="mt-5">
        <p className="text-xs font-medium text-ink-soft">
          Capabilities are defined in the application and cannot be invented here — the list above is exactly what the
          code checks. Most of the CRM is governed by ownership rather than by role: a rep can always work their own
          accounts, opportunities and quotes, whatever their role says.
        </p>
      </Card>
    </>
  );
}
