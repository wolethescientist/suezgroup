import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, money, titleCase } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { decideExpense } from "@/lib/actions/finance";
import { DUAL_APPROVAL_THRESHOLD } from "@/lib/permissions";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string }>`select ref from expenses where id = ${Number(id)}`;
  return { title: r ? `Expense ${r.ref}` : "Not found" };
}

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;

  const [e] = await sql<{
    id: number; ref: string; description: string; category: string; amount: string; currency: string;
    spent_on: string; status: string; decision_note: string | null; decided_at: string | null;
    user_id: number; who: string; who_avatar: string | null; project: string | null;
    approver: string | null; receipt_id: number | null;
    approver_id: number | null; second_approver: string | null;
  }>`
    select e.*, u.full_name as who, u.avatar_url as who_avatar, p.name as project,
           a.full_name as approver, a2.full_name as second_approver
      from expenses e
      join users u on u.id = e.user_id
      left join projects p on p.id = e.project_id
      left join users a on a.id = e.approver_id
      left join users a2 on a2.id = e.second_approver_id
     where e.id = ${Number(id)}`;
  if (!e) notFound();

  const isFinance = can(me, "expense.approve");
  if (e.user_id !== me.id && !isFinance) notFound();
  const needsTwo = Number(e.amount) > DUAL_APPROVAL_THRESHOLD;
  // Nobody approves their own claim, and nobody gives both signatures.
  const alreadySigned = e.status === "awaiting_second" && e.approver_id === me.id;
  const canDecide = isFinance && e.user_id !== me.id && !alreadySigned;

  return (
    <>
      <PageHeader title={e.ref} subtitle={`${titleCase(e.category)} · ${fmtDate(e.spent_on)}`} />

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardTitle action={<Badge value={e.status} />}>Claim</CardTitle>
          <p className="text-lg font-bold tabular">{money(e.amount, e.currency)}</p>
          <p className="mt-2 text-sm font-medium whitespace-pre-wrap">{e.description}</p>
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-ink-soft">
            <Avatar name={e.who} src={e.who_avatar} size="sm" /> {e.who}
            {e.project ? ` · ${e.project}` : ""}
          </p>
          {e.receipt_id && (
            <a href={`/api/files/${e.receipt_id}`} target="_blank" rel="noreferrer"
               className="mt-4 inline-block text-xs font-bold text-brand-700 hover:underline">View receipt →</a>
          )}
          {e.decided_at && (
            <p className="mt-4 border-t border-line pt-3 text-xs font-semibold text-ink-soft">
              {titleCase(e.status)} by {e.approver ?? "—"} on {fmtDateTime(e.decided_at)}
              {e.second_approver ? `, countersigned by ${e.second_approver}` : ""}
              {e.decision_note ? ` — ${e.decision_note}` : ""}
            </p>
          )}
          {alreadySigned && (
            <p className="mt-4 rounded-xl bg-canvas px-3 py-2 text-xs font-semibold text-ink-soft">
              You gave the first approval. A different approver has to give the second.
            </p>
          )}
          <Link href="/finance/expenses" className="mt-4 block text-xs font-bold text-brand-700 hover:underline">← All expenses</Link>
        </Card>

        {canDecide && e.status !== "reimbursed" && e.status !== "rejected" && (
          <Card>
            <CardTitle>Decision</CardTitle>
            {/* One form per decision — a submit button's name/value does not reach the
                action across the server/client boundary. See the requisition page. */}
            {/* Above the threshold the company's expense circular requires two
                different approvers. The claim sits in awaiting_second between them. */}
            {needsTwo && (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 ring-inset">
                {money(e.amount, e.currency)} is over the {money(DUAL_APPROVAL_THRESHOLD)} threshold, so it needs
                two different approvers.
                {e.status === "awaiting_second" && ` ${e.approver ?? "Someone"} gave the first.`}
              </p>
            )}

            {(e.status === "pending" || e.status === "awaiting_second") && (
              <>
                <ActionForm action={decideExpense} className="space-y-3">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <Field label="Note (optional)"><textarea name="note" rows={3} className="field resize-y" /></Field>
                  <SubmitBtn>
                    {e.status === "awaiting_second" ? "Give second approval" : needsTwo ? "Give first approval" : "Approve"}
                  </SubmitBtn>
                </ActionForm>

                <ActionForm action={decideExpense} className="mt-4 space-y-3 border-t border-line pt-4">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <Field label="Reason for rejection" hint="Shared with the claimant.">
                    <textarea name="note" rows={3} required className="field resize-y" />
                  </Field>
                  <SubmitBtn variant="ghost">Reject</SubmitBtn>
                </ActionForm>
              </>
            )}

            {e.status === "approved" && (
              <ActionForm action={decideExpense} className="space-y-3">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="decision" value="reimbursed" />
                <Field label="Payment reference (optional)"><textarea name="note" rows={2} className="field resize-y" /></Field>
                <SubmitBtn>Mark reimbursed</SubmitBtn>
              </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
