import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, money, titleCase } from "@/lib/format";
import { Badge, Card, CardTitle, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { PurchaseOrderForm } from "@/components/erp-forms";
import { createPurchaseOrder, decideRequisition } from "@/lib/actions/supply";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string }>`select ref from purchase_requisitions where id = ${Number(id)}`;
  return { title: r ? `Requisition ${r.ref}` : "Not found" };
}

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;

  const [r] = await sql<{
    id: number; ref: string; title: string; justification: string | null; needed_by: string | null;
    estimated_cost: string; currency: string; status: string; decision_note: string | null; decided_at: string | null;
    requester: string; department: string | null; project: string | null; approver: string | null;
    requester_id: number; department_id: number | null;
  }>`
    select r.*, u.full_name as requester, d.name as department, p.name as project, a.full_name as approver
      from purchase_requisitions r
      join users u on u.id = r.requester_id
      left join departments d on d.id = r.department_id
      left join projects p on p.id = r.project_id
      left join users a on a.id = r.approver_id
     where r.id = ${Number(id)}`;
  if (!r) notFound();

  const isBuyer = can(me, "requisition.approve");
  // The head of the department that raised it can decide too.
  const [head] = await sql<{ head_id: number | null }>`
    select head_id from departments where id = ${r.department_id}`;
  // Nobody decides their own — so do not offer them the buttons and then refuse.
  const canDecide = (isBuyer || head?.head_id === me.id) && r.requester_id !== me.id;
  const [vendors, items] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from vendors where status = 'active' order by name`,
    sql<{ id: number; sku: string; name: string }>`select id, sku, name from inventory_items where status = 'active' order by name limit 500`,
  ]);

  return (
    <>
      <PageHeader title={r.ref} subtitle={`${r.requester}${r.department ? ` · ${r.department}` : ""}${r.project ? ` · ${r.project}` : ""}`}>
        <Badge value={r.status} />
        {isBuyer && r.status === "approved" && (
          <PurchaseOrderForm action={createPurchaseOrder} requisitionId={r.id}
            vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
            items={items.map((i) => ({ id: i.id, label: `${i.sku} — ${i.name}` }))} />
        )}
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardTitle>Requisition</CardTitle>
          <h2 className="font-bold">{r.title}</h2>
          {r.justification && <p className="mt-2 text-sm font-medium whitespace-pre-wrap">{r.justification}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div><dt className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Estimate</dt><dd className="mt-0.5 font-bold tabular">{money(r.estimated_cost, r.currency)}</dd></div>
            <div><dt className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Needed by</dt><dd className="mt-0.5 font-bold">{fmtDate(r.needed_by)}</dd></div>
          </dl>
          {r.decided_at && (
            <p className="mt-4 border-t border-line pt-3 text-xs font-semibold text-ink-soft">
              {titleCase(r.status)} by {r.approver ?? "—"} on {fmtDateTime(r.decided_at)}
              {r.decision_note ? ` — ${r.decision_note}` : ""}
            </p>
          )}
          <Link href="/procurement" className="mt-4 block text-xs font-bold text-brand-700 hover:underline">← Procurement</Link>
        </Card>

        {canDecide && r.status === "pending" && (
          <Card>
            <CardTitle>Decision</CardTitle>
            {/*
              Two forms, each carrying its decision as a hidden input, rather than one
              form with two named submit buttons: a submitter's name/value does not
              survive the server/client boundary here, so the action would receive no
              decision at all. Rejection asks for a reason; approval does not.
            */}
            <ActionForm action={decideRequisition} className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="approved" />
              <Field label="Note (optional)"><textarea name="note" rows={3} className="field resize-y" /></Field>
              <SubmitBtn>Approve</SubmitBtn>
            </ActionForm>

            <ActionForm action={decideRequisition} className="mt-4 space-y-3 border-t border-line pt-4">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="decision" value="rejected" />
              <Field label="Reason for rejection" hint="Shared with the requester.">
                <textarea name="note" rows={3} required className="field resize-y" />
              </Field>
              <SubmitBtn variant="ghost">Reject</SubmitBtn>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
