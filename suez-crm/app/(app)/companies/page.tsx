import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { crmOptions } from "@/lib/crm";
import { compactMoney } from "@/lib/format";
import { Avatar, Badge, BtnLink, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { Dialog } from "@/components/form";
import { CompanyForm } from "@/components/crm-forms";
import { Icon } from "@/components/icons";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const { q = "", status = "" } = await searchParams;
  const like = `%${q}%`;

  const [rows, options] = await Promise.all([
    sql<{ id: number; name: string; industry: string | null; status: string; owner: string | null; contacts: number; open_value: string; deals: number }>`
      select c.id, c.name, c.industry, c.status, u.full_name as owner,
             (select count(*) from crm_contacts ct where ct.company_id = c.id)::int as contacts,
             (select count(*) from crm_deals d where d.company_id = c.id and d.stage not in ('won','lost'))::int as deals,
             (select coalesce(sum(value),0) from crm_deals d where d.company_id = c.id and d.stage not in ('won','lost')) as open_value
        from crm_companies c
        left join users u on u.id = c.owner_id
       where (${q} = '' or c.name ilike ${like} or c.industry ilike ${like} or c.email ilike ${like})
         and (${status} = '' or c.status = ${status})
       order by c.name`,
    crmOptions(),
  ]);

  return (
    <>
      <PageHeader title="Companies" subtitle={`${rows.length} account${rows.length === 1 ? "" : "s"} on file.`}>
        <BtnLink href="/api/export/crm-companies" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <Dialog label={<><Icon name="plus" /> New company</>} title="Add company">
          <CompanyForm owners={options.owners} />
        </Dialog>
      </PageHeader>

      <form className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <input name="q" defaultValue={q} placeholder="Search companies…" className="field pl-9 sm:w-72" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </div>
        <select name="status" defaultValue={status} className="field sm:w-44">
          <option value="">Any relationship</option>
          {["lead", "prospect", "customer", "churned"].map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-brand-50 px-3.5 py-2 text-sm font-bold text-brand-700 hover:bg-brand-100">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty title="No companies match" hint="Clear the filters, or add a new account." />
        </Card>
      ) : (
        <Table head={["Company", "Industry", "Relationship", "Contacts", "Open pipeline", "Owner", ""]}>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-canvas">
              <Td>
                <Link href={`/companies/${c.id}`} className="flex items-center gap-3">
                  <Avatar name={c.name} size="md" />
                  <span className="font-bold hover:text-brand-700">{c.name}</span>
                </Link>
              </Td>
              <Td className="text-ink-soft">{c.industry ?? "—"}</Td>
              <Td>
                <Badge value={c.status} />
              </Td>
              <Td className="tabular">{c.contacts}</Td>
              <Td className="tabular">
                {compactMoney(c.open_value)}
                <span className="ml-1 text-xs font-medium text-ink-soft">({c.deals})</span>
              </Td>
              <Td className="text-ink-soft">{c.owner ?? "—"}</Td>
              <Td className="text-right">
                <Link href={`/companies/${c.id}`} className="text-xs font-bold text-brand-700 hover:underline">
                  Open
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
