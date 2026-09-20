import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, titleCase } from "@/lib/format";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, SubmitBtn } from "@/components/form";
import { PurchaseOrderForm, RequisitionForm, VendorForm } from "@/components/erp-forms";
import { createPurchaseOrder, deleteVendor, raiseRequisition, saveVendor } from "@/lib/actions/supply";

export const metadata = { title: "Procurement" };

const TABS = [["requisitions", "Requisitions"], ["orders", "Purchase orders"], ["vendors", "Vendors"]] as const;

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const { tab = "requisitions" } = await searchParams;
  // Each control sits behind the capability it actually needs, so a role that
  // handles orders but not the supplier register sees exactly that.
  const canOrder = can(me, "po.manage");
  const canVendors = can(me, "vendor.manage");
  const isBuyer = canOrder || canVendors || can(me, "requisition.approve");

  const [stats] = await sql<{ pending: number; open_orders: number; committed: string }>`
    select (select count(*) from purchase_requisitions where status = 'pending')::int as pending,
           (select count(*) from purchase_orders where status in ('draft','sent','part_received'))::int as open_orders,
           coalesce((select sum(total) from purchase_orders where status in ('sent','part_received')), 0) as committed`;

  const [vendors, projects, items] = await Promise.all([
    sql<{ id: number; name: string; category: string | null; email: string | null; phone: string | null; address: string | null; tax_id: string | null; bank_details: string | null; rating: number | null; status: string; notes: string | null; orders: number }>`
      select v.*, (select count(*) from purchase_orders o where o.vendor_id = v.id)::int as orders
        from vendors v order by v.name`,
    sql<{ id: number; name: string }>`select id, name from projects where status in ('planning','active') order by name`,
    sql<{ id: number; sku: string; name: string }>`select id, sku, name from inventory_items where status = 'active' order by name limit 500`,
  ]);

  const vendorOpts = vendors.filter((v) => v.status === "active").map((v) => ({ id: v.id, label: v.name }));
  const itemOpts = items.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name}` }));

  return (
    <>
      <PageHeader title="Procurement" subtitle="Requisitions, purchase orders and the supplier register.">
        <RequisitionForm action={raiseRequisition} projects={projects.map((p) => ({ id: p.id, label: p.name }))} />
        {canOrder && <PurchaseOrderForm action={createPurchaseOrder} vendors={vendorOpts} items={itemOpts} />}
        {canVendors && <VendorForm action={saveVendor} />}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Requisitions awaiting approval" value={stats.pending} tone="amber" />
        <Stat label="Open purchase orders" value={stats.open_orders} tone="sky" />
        <Stat label="Committed spend" value={money(stats.committed)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/procurement?tab=${key}`}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${tab === key ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"}`}>
            {label}
          </Link>
        ))}
      </div>

      {tab === "requisitions" && <Requisitions mine={!isBuyer} userId={me.id} />}
      {tab === "orders" && <Orders />}
      {tab === "vendors" && (
        vendors.length === 0 ? (
          <Card><Empty title="No vendors yet" hint="Add your suppliers so purchase orders can name them." /></Card>
        ) : (
          <Table head={["Vendor", "Category", "Contact", "Rating", "Orders", "Status", ""]}>
            {vendors.map((v) => (
              <tr key={v.id} className="hover:bg-canvas">
                <Td className="font-bold">{v.name}</Td>
                <Td>{v.category ?? "—"}</Td>
                <Td className="text-xs">{v.email ?? "—"}<br />{v.phone ?? ""}</Td>
                <Td>{v.rating ? "★".repeat(v.rating) : "—"}</Td>
                <Td className="tabular">{v.orders}</Td>
                <Td><Badge value={v.status} /></Td>
                <Td>
                  {canVendors && (
                    <span className="flex gap-1">
                      <VendorForm action={saveVendor} vendor={v} />
                      {can(me, "vendor.delete") && v.orders === 0 && (
                        <ActionForm action={deleteVendor}>
                          <input type="hidden" name="id" value={v.id} />
                          <ConfirmBtn
                            title={`Delete ${v.name}?`}
                            body="The supplier is removed from the register. This is only possible because they have no purchase orders against them."
                            confirmLabel="Delete supplier"
                            confirmWord={v.name}
                          >
                            Delete
                          </ConfirmBtn>
                        </ActionForm>
                      )}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )
      )}
    </>
  );
}

async function Requisitions({ mine, userId }: { mine: boolean; userId: number }) {
  const rows = await sql<{ id: number; ref: string; title: string; status: string; estimated_cost: string; currency: string; needed_by: string | null; requester: string; department: string | null }>`
    select r.id, r.ref, r.title, r.status, r.estimated_cost, r.currency, r.needed_by,
           u.full_name as requester, d.name as department
      from purchase_requisitions r
      join users u on u.id = r.requester_id
      left join departments d on d.id = r.department_id
     where ${!mine} or r.requester_id = ${userId}
     order by case r.status when 'pending' then 0 else 1 end, r.created_at desc limit 200`;

  if (!rows.length) return <Card><Empty title="No requisitions" hint="Raise one when you need something bought." /></Card>;
  return (
    <Table head={["Reference", "What", "Requested by", "Needed by", "Estimate", "Status"]}>
      {rows.map((r) => (
        <tr key={r.id} className="hover:bg-canvas">
          <Td><Link href={`/procurement/requisitions/${r.id}`} className="font-bold text-brand-700 hover:underline">{r.ref}</Link></Td>
          <Td className="max-w-xs truncate">{r.title}</Td>
          <Td>{r.requester}{r.department ? <span className="text-ink-soft"> · {r.department}</span> : null}</Td>
          <Td>{fmtDate(r.needed_by)}</Td>
          <Td className="tabular">{money(r.estimated_cost, r.currency)}</Td>
          <Td><Badge value={r.status} /></Td>
        </tr>
      ))}
    </Table>
  );
}

async function Orders() {
  const rows = await sql<{ id: number; ref: string; vendor: string | null; order_date: string; expected_date: string | null; total: string; currency: string; status: string; lines: number }>`
    select o.id, o.ref, v.name as vendor, o.order_date, o.expected_date, o.total, o.currency, o.status,
           (select count(*) from purchase_order_lines l where l.po_id = o.id)::int as lines
      from purchase_orders o left join vendors v on v.id = o.vendor_id
     order by o.order_date desc, o.id desc limit 200`;

  if (!rows.length) return <Card><Empty title="No purchase orders" hint="Approve a requisition, then raise an order against it." /></Card>;
  return (
    <Table head={["Reference", "Vendor", "Ordered", "Expected", "Lines", "Total", "Status"]}>
      {rows.map((o) => (
        <tr key={o.id} className="hover:bg-canvas">
          <Td><Link href={`/procurement/orders/${o.id}`} className="font-bold text-brand-700 hover:underline">{o.ref}</Link></Td>
          <Td>{o.vendor ?? "—"}</Td>
          <Td>{fmtDate(o.order_date)}</Td>
          <Td>{fmtDate(o.expected_date)}</Td>
          <Td className="tabular">{o.lines}</Td>
          <Td className="tabular font-bold">{money(o.total, o.currency)}</Td>
          <Td><Badge value={o.status} /></Td>
        </tr>
      ))}
    </Table>
  );
}
