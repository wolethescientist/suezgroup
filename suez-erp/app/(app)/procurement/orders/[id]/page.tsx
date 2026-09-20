import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money } from "@/lib/format";
import { Badge, Card, CardTitle, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { receivePurchaseOrder, setPoStatus } from "@/lib/actions/supply";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string }>`select ref from purchase_orders where id = ${Number(id)}`;
  return { title: r ? `Order ${r.ref}` : "Not found" };
}

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCap("po.manage");
  const { id } = await params;

  const [o] = await sql<{
    id: number; ref: string; vendor: string | null; vendor_email: string | null; order_date: string;
    expected_date: string | null; currency: string; subtotal: string; tax_amount: string; total: string;
    status: string; notes: string | null; requisition_ref: string | null; created_by: string | null;
  }>`
    select o.*, v.name as vendor, v.email as vendor_email, r.ref as requisition_ref, u.full_name as created_by
      from purchase_orders o
      left join vendors v on v.id = o.vendor_id
      left join purchase_requisitions r on r.id = o.requisition_id
      left join users u on u.id = o.created_by
     where o.id = ${Number(id)}`;
  if (!o) notFound();

  const lines = await sql<{ id: number; description: string; quantity: string; received_qty: string; unit_price: string; line_total: string; sku: string | null }>`
    select l.*, i.sku from purchase_order_lines l left join inventory_items i on i.id = l.item_id
     where l.po_id = ${o.id} order by l.id`;

  return (
    <>
      <PageHeader title={o.ref} subtitle={`${o.vendor ?? "no vendor"} · ordered ${fmtDate(o.order_date)}${o.requisition_ref ? ` · from ${o.requisition_ref}` : ""}`}>
        <Badge value={o.status} />
        <PrintButton />
        {o.status === "draft" && (
          <ActionForm action={setPoStatus}>
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="status" value="sent" />
            <SubmitBtn>Mark as sent</SubmitBtn>
          </ActionForm>
        )}
        {["sent", "part_received"].includes(o.status) && (
          <Dialog label="Receive into stock" title={`Receive against ${o.ref}`}
                  description="Enter what actually arrived. Part deliveries are fine — the order stays open until every line is complete.">
            <ActionForm action={receivePurchaseOrder} className="space-y-4">
              <input type="hidden" name="id" value={o.id} />
              <div className="space-y-3">
                {lines.map((l) => {
                  const left = Number(l.quantity) - Number(l.received_qty);
                  return (
                    <div key={l.id} className="flex items-end gap-3">
                      <input type="hidden" name="line_id" value={l.id} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{l.description}</p>
                        <p className="text-xs text-ink-soft">
                          {Number(l.received_qty)} of {Number(l.quantity)} received · {left} outstanding
                        </p>
                      </div>
                      <input name="receive_qty" type="number" step="0.01" min="0" max={left}
                             defaultValue={left} disabled={left <= 0}
                             className="field w-28 !py-1.5 tabular" />
                    </div>
                  );
                })}
              </div>
              <SubmitBtn className="w-full">Record delivery</SubmitBtn>
            </ActionForm>
          </Dialog>
        )}
      </PageHeader>

      <Card>
        <CardTitle action={<span className="text-xs font-semibold text-ink-soft">Expected {fmtDate(o.expected_date)}</span>}>Order lines</CardTitle>
        <Table head={["Item", "Description", "Qty", "Received", "Unit price", "Total"]}>
          {lines.map((l) => (
            <tr key={l.id}>
              <Td className="font-mono text-xs">{l.sku ?? "—"}</Td>
              <Td>{l.description}</Td>
              <Td className="tabular">{Number(l.quantity)}</Td>
              <Td className="tabular">{Number(l.received_qty)}</Td>
              <Td className="tabular">{money(l.unit_price, o.currency)}</Td>
              <Td className="tabular font-bold">{money(l.line_total, o.currency)}</Td>
            </tr>
          ))}
        </Table>
        <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="font-semibold text-ink-soft">Subtotal</dt><dd className="tabular font-bold">{money(o.subtotal, o.currency)}</dd></div>
          <div className="flex justify-between"><dt className="font-semibold text-ink-soft">VAT</dt><dd className="tabular font-bold">{money(o.tax_amount, o.currency)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1.5 text-base"><dt className="font-bold">Total</dt><dd className="tabular font-bold">{money(o.total, o.currency)}</dd></div>
        </dl>
        {o.notes && <p className="mt-4 border-t border-line pt-3 text-sm font-medium text-ink-soft whitespace-pre-wrap">{o.notes}</p>}
        <Link href="/procurement?tab=orders" className="mt-4 block text-xs font-bold text-brand-700 hover:underline print:hidden">← All orders</Link>
      </Card>
    </>
  );
}
