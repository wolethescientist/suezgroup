import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, titleCase } from "@/lib/format";
import { Badge, Card, CardTitle, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { PaymentForm } from "@/components/erp-forms";
import { recordPayment, setInvoiceStatus } from "@/lib/actions/finance";
import { PrintButton } from "@/components/print-button";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string }>`select ref from invoices where id = ${Number(id)}`;
  return { title: r ? `Invoice ${r.ref}` : "Not found" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCap("invoice.manage");
  const { id } = await params;

  const [inv] = await sql<{
    id: number; ref: string; kind: string; party: string | null; issue_date: string; due_date: string | null;
    currency: string; subtotal: string; tax_rate: string; tax_amount: string; total: string;
    amount_paid: string; status: string; notes: string | null; project: string | null; created_by: string | null;
    po_id: number | null; po_ref: string | null; po_total: string | null; po_status: string | null;
  }>`
    select i.*, coalesce(c.name, v.name) as party, p.name as project, u.full_name as created_by,
           o.ref as po_ref, o.total as po_total, o.status as po_status
      from invoices i
      left join customers c on c.id = i.customer_id
      left join vendors v on v.id = i.vendor_id
      left join projects p on p.id = i.project_id
      left join users u on u.id = i.created_by
      left join purchase_orders o on o.id = i.po_id
     where i.id = ${Number(id)}`;
  if (!inv) notFound();

  const [lines, payments] = await Promise.all([
    sql<{ id: number; description: string; quantity: string; unit_price: string; line_total: string }>`
      select * from invoice_lines where invoice_id = ${inv.id} order by id`,
    sql<{ id: number; amount: string; paid_on: string; method: string; reference: string | null; who: string | null }>`
      select p.*, u.full_name as who from payments p left join users u on u.id = p.recorded_by
       where p.invoice_id = ${inv.id} order by p.paid_on desc, p.id desc`,
  ]);

  const outstanding = Number(inv.total) - Number(inv.amount_paid);

  /**
   * Three-way match: the order, what was actually received, and what is being
   * billed. Previously an invoice had no link to its purchase order at all, so
   * nothing reconciled an invoice against goods that may never have arrived.
   */
  const match = inv.po_id
    ? (
        await sql<{ ordered: string; received: string }>`
          select coalesce(sum(quantity), 0) as ordered, coalesce(sum(received_qty), 0) as received
            from purchase_order_lines where po_id = ${inv.po_id}`
      )[0]
    : null;

  return (
    <>
      <PageHeader title={inv.ref} subtitle={`${titleCase(inv.kind)} invoice · ${inv.party ?? "no party"}${inv.project ? ` · ${inv.project}` : ""}`}>
        <PrintButton />
        {outstanding > 0 && inv.status !== "void" && (
          <PaymentForm action={recordPayment} invoiceId={inv.id} outstanding={outstanding} />
        )}
        {inv.status === "draft" && (
          <ActionForm action={setInvoiceStatus}>
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="status" value="sent" />
            <SubmitBtn>Mark as sent</SubmitBtn>
          </ActionForm>
        )}
      </PageHeader>

      {match && (
        <Card className="mb-5">
          <CardTitle>Three-way match</CardTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Ordered</p>
              <p className="text-sm font-bold">
                <Link href={`/procurement/orders/${inv.po_id}`} className="text-brand-700 hover:underline">{inv.po_ref}</Link>
                {" \u00b7 "}{money(inv.po_total, inv.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Received</p>
              <p className="text-sm font-bold">
                {Number(match.received)} of {Number(match.ordered)} unit(s)
                {Number(match.received) < Number(match.ordered) && (
                  <span className="ml-2 text-xs font-bold text-amber-700">Part delivery</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Billed</p>
              <p className="text-sm font-bold">
                {money(inv.total, inv.currency)}
                {Number(inv.total) > Number(inv.po_total) && (
                  <span className="ml-2 text-xs font-bold text-rose-700">Over the order</span>
                )}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardTitle action={<Badge value={inv.status} />}>Invoice</CardTitle>
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Issued", fmtDate(inv.issue_date)],
                ["Due", fmtDate(inv.due_date)],
                ["Raised by", inv.created_by ?? "—"],
                ["Currency", inv.currency],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">{k}</dt>
                  <dd className="mt-0.5 font-bold">{v}</dd>
                </div>
              ))}
            </dl>

            <Table head={["Description", "Qty", "Unit price", "Total"]}>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td className="tabular">{Number(l.quantity)}</Td>
                  <Td className="tabular">{money(l.unit_price, inv.currency)}</Td>
                  <Td className="tabular font-bold">{money(l.line_total, inv.currency)}</Td>
                </tr>
              ))}
            </Table>

            <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="font-semibold text-ink-soft">Subtotal</dt><dd className="tabular font-bold">{money(inv.subtotal, inv.currency)}</dd></div>
              <div className="flex justify-between"><dt className="font-semibold text-ink-soft">VAT ({Number(inv.tax_rate)}%)</dt><dd className="tabular font-bold">{money(inv.tax_amount, inv.currency)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 text-base"><dt className="font-bold">Total</dt><dd className="tabular font-bold">{money(inv.total, inv.currency)}</dd></div>
              <div className="flex justify-between"><dt className="font-semibold text-ink-soft">Paid</dt><dd className="tabular font-bold text-emerald-700">{money(inv.amount_paid, inv.currency)}</dd></div>
              <div className="flex justify-between"><dt className="font-bold">Outstanding</dt><dd className={`tabular font-bold ${outstanding > 0 ? "text-rose-700" : ""}`}>{money(outstanding, inv.currency)}</dd></div>
            </dl>

            {inv.notes && <p className="mt-4 border-t border-line pt-3 text-sm font-medium text-ink-soft whitespace-pre-wrap">{inv.notes}</p>}
          </Card>
        </div>

        <Card className="print:hidden">
          <CardTitle>Payments</CardTitle>
          {payments.length === 0 ? (
            <p className="text-sm font-medium text-ink-soft">Nothing received yet.</p>
          ) : (
            <ul className="space-y-3">
              {payments.map((p) => (
                <li key={p.id} className="border-b border-line pb-3 last:border-0">
                  <p className="font-bold tabular">{money(p.amount, inv.currency)}</p>
                  <p className="text-xs font-semibold text-ink-soft">
                    {fmtDate(p.paid_on)} · {titleCase(p.method)}{p.reference ? ` · ${p.reference}` : ""}
                  </p>
                  <p className="text-xs font-medium text-ink-soft">Recorded by {p.who ?? "—"}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/finance/invoices" className="mt-4 block text-xs font-bold text-brand-700 hover:underline">← All invoices</Link>
        </Card>
      </div>
    </>
  );
}
