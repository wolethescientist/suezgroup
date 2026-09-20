import Link from "next/link";
import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money } from "@/lib/format";
import { Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { InvoiceForm } from "@/components/erp-forms";
import { createInvoice } from "@/lib/actions/finance";

export const metadata = { title: "Invoices" };

type Row = {
  id: number; ref: string; kind: string; party: string | null; issue_date: string; due_date: string | null;
  currency: string; total: string; amount_paid: string; status: string;
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireCap("invoice.manage");
  const { status = "" } = await searchParams;

  // Overdue is derived at read time rather than stored, so it is never stale.
  const rows = await sql<Row>`
    select i.id, i.ref, i.kind, coalesce(c.name, v.name) as party, i.issue_date, i.due_date,
           i.currency, i.total, i.amount_paid,
           case when i.status in ('draft','paid','void') then i.status
                when i.due_date is not null and i.due_date < current_date and i.amount_paid < i.total then 'overdue'
                else i.status end as status
      from invoices i
      left join customers c on c.id = i.customer_id
      left join vendors v on v.id = i.vendor_id
     where (${status} = '' or i.status = ${status})
     order by i.issue_date desc, i.id desc
     limit 200`;

  const [totals] = await sql<{ outstanding: string; overdue: string; paid_30: string }>`
    select coalesce(sum(total - amount_paid) filter (where status not in ('paid','void')), 0) as outstanding,
           coalesce(sum(total - amount_paid) filter (where status not in ('paid','void') and due_date < current_date), 0) as overdue,
           coalesce(sum(amount_paid) filter (where issue_date > current_date - 30), 0) as paid_30
      from invoices where kind = 'sales'`;

  const [companies, vendors, projects, orders] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from customers where status <> 'closed' order by name limit 500`,
    sql<{ id: number; name: string }>`select id, name from vendors where status = 'active' order by name`,
    sql<{ id: number; name: string }>`select id, name from projects where status in ('planning','active') order by name`,
    // Orders that have been sent and are not yet settled by an invoice.
    sql<{ id: number; name: string }>`
      select o.id, o.ref || ' — ' || coalesce(v.name, 'no vendor') || ' — ' || to_char(o.total, 'FM999,999,999.00') as name
        from purchase_orders o
        left join vendors v on v.id = o.vendor_id
       where o.status in ('sent','part_received','received')
         and not exists (select 1 from invoices i where i.po_id = o.id and i.status <> 'cancelled')
       order by o.order_date desc limit 200`,
  ]);

  return (
    <>
      <PageHeader title="Invoices" subtitle="Sales and purchase invoices, with payments recorded against them.">
        <BtnLink href="/api/export/invoices" variant="ghost" prefetch={false}>Export CSV</BtnLink>
        <InvoiceForm
          action={createInvoice}
          companies={companies.map((c) => ({ id: c.id, label: c.name }))}
          vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
          projects={projects.map((p) => ({ id: p.id, label: p.name }))}
          orders={orders.map((o) => ({ id: o.id, label: o.name }))}
        />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={money(totals.outstanding)} hint="Sales invoices not fully paid" />
        <Stat label="Overdue" value={money(totals.overdue)} tone="rose" hint="Past their due date" />
        <Stat label="Collected (30 days)" value={money(totals.paid_30)} tone="emerald" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
        {["", "draft", "sent", "part_paid", "paid", "void"].map((s) => (
          <Link key={s || "all"} href={s ? `/finance/invoices?status=${s}` : "/finance/invoices"}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${status === s ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"}`}>
            {s ? s.replace("_", " ") : "All"}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No invoices yet" hint="Raise one and record payments against it as they arrive." /></Card>
      ) : (
        <Table head={["Reference", "Party", "Issued", "Due", "Total", "Outstanding", "Status"]}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <Td><Link href={`/finance/invoices/${r.id}`} className="font-bold text-brand-700 hover:underline">{r.ref}</Link></Td>
              <Td>{r.party ?? "—"}</Td>
              <Td>{fmtDate(r.issue_date)}</Td>
              <Td>{fmtDate(r.due_date)}</Td>
              <Td className="tabular">{money(r.total, r.currency)}</Td>
              <Td className="tabular">{money(Number(r.total) - Number(r.amount_paid), r.currency)}</Td>
              <Td><Badge value={r.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
