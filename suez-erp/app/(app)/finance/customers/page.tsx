import Link from "next/link";
import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { compactMoney } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ActionForm, ConfirmBtn } from "@/components/form";
import { CustomerForm } from "@/components/erp-forms";
import { deleteCustomer, saveCustomer } from "@/lib/actions/finance";

export const metadata = { title: "Clients" };

/**
 * The client register.
 *
 * ponytail: this screen did not exist. `customers` was read by invoicing,
 * projects, the dashboard and search, but nothing could create one, so the
 * client dropdown on a sales invoice only ever offered "None" and the sole way
 * in was Admin > Data Import.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCap("customer.manage");
  const q = (await searchParams).q?.trim() ?? "";
  const like = `%${q}%`;

  const rows = await sql<{
    id: number; name: string; email: string | null; phone: string | null;
    address: string | null; tax_id: string | null; status: string;
    invoices: number; billed: string; outstanding: string;
  }>`
    select c.*,
           (select count(*) from invoices i where i.customer_id = c.id and i.kind = 'sales')::int as invoices,
           coalesce((select sum(i.total) from invoices i
                      where i.customer_id = c.id and i.kind = 'sales' and i.status <> 'void'), 0) as billed,
           coalesce((select sum(i.total - i.amount_paid) from invoices i
                      where i.customer_id = c.id and i.kind = 'sales'
                        and i.status not in ('paid','void')), 0) as outstanding
      from customers c
     where ${q === ""} or c.name ilike ${like} or c.email ilike ${like} or c.tax_id ilike ${like}
     order by c.name`;

  const active = rows.filter((r) => r.status === "active").length;
  const owed = rows.reduce((s, r) => s + Number(r.outstanding), 0);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="The bill-to record: who the company invoices, and what they owe. Account history lives in the CRM."
      >
        <CustomerForm action={saveCustomer} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Clients on file" value={rows.length} />
        <Stat label="Active" value={active} tone="emerald" />
        <Stat label="Outstanding" value={compactMoney(owed)} tone="amber" />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <input name="q" defaultValue={q} placeholder="Search name, email or tax ID…" className="field pl-9" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </div>
        <button type="submit" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">Search</button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty
            title={q ? "No clients match that" : "No clients yet"}
            hint={q ? "Try a shorter term." : "Add your first client, or bring the list in under Admin → Data Import."}
          />
        </Card>
      ) : (
        <Table head={["Client", "Tax ID", "Contact", "Invoices", "Outstanding", "Status", ""]}>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-canvas">
              <Td className="font-bold">{c.name}</Td>
              <Td className="text-xs">{c.tax_id ?? <span className="text-ink-soft">—</span>}</Td>
              <Td className="text-xs">
                {c.email ?? "—"}
                {c.phone && <span className="block text-ink-soft">{c.phone}</span>}
              </Td>
              <Td className="tabular">
                {c.invoices > 0 ? (
                  <Link href={`/finance/invoices?q=${encodeURIComponent(c.name)}`} className="font-bold text-brand-700 hover:underline">
                    {c.invoices}
                  </Link>
                ) : (
                  <span className="text-ink-soft">0</span>
                )}
              </Td>
              <Td className={`tabular font-bold ${Number(c.outstanding) > 0 ? "text-amber-700" : ""}`}>
                {compactMoney(c.outstanding)}
              </Td>
              <Td><Badge value={c.status} /></Td>
              <Td>
                <span className="flex gap-1">
                  <CustomerForm action={saveCustomer} customer={c} />
                  {c.invoices === 0 && (
                    <ActionForm action={deleteCustomer}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmBtn
                        title={`Delete ${c.name}?`}
                        body="They are removed from the client register. This is only possible because they have no invoices."
                        confirmLabel="Delete client"
                        confirmWord={c.name}
                      >
                        Delete
                      </ConfirmBtn>
                    </ActionForm>
                  )}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
