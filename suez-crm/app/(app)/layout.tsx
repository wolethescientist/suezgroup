import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOrg } from "@/lib/settings";
import { Shell } from "@/components/shell";
import { NAV } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const org = await getOrg();

  /**
   * Sidebar badges. The deposit badge counts accounts that have fallen to or
   * below their own warning level, because an account quietly running dry is
   * the thing nobody notices until a customer asks.
   */
  const [counts] = await sql<{ notifications: number; deposits: number }>`
    select
      (select count(*) from notifications where user_id = ${user.id} and read_at is null)::int as notifications,
      (select count(*)
         from crm_deposits d
         join crm_companies c on c.id = d.company_id
         join crm_deposit_balances b on b.deposit_id = d.id
        where d.status = 'active'
          and b.balance <= b.funded * d.low_balance_ratio
          and (${can(user, "deposit.view")} or d.owner_id = ${user.id} or c.owner_id = ${user.id}))::int as deposits`;

  const notes = await sql<{ id: number; title: string; body: string | null; href: string | null; created_at: string }>`
    select id, title, body, href, created_at
      from notifications
     where user_id = ${user.id}
     order by read_at nulls first, created_at desc
     limit 6`;

  return (
    <Shell
      user={user}
      org={org.name}
      product="CRM"
      groups={NAV}
      counts={counts}
      notes={notes}
      searchPlaceholder="Search companies, contacts, deals…"
    >
      {children}
    </Shell>
  );
}
