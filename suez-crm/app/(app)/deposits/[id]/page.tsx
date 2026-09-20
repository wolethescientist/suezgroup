import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { ENTRY_KINDS, getDeposit, ledgerFor, remainingRatio } from "@/lib/deposits";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, Dialog } from "@/components/form";
import { Icon } from "@/components/icons";
import { AdjustmentForm, DepositForm, DrawdownForm, FundingForm } from "@/components/deposit-forms";
import { deleteDepositEntry } from "@/lib/actions/deposits";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string; name: string }>`select ref, name from crm_deposits where id = ${Number(id)}`;
  return { title: r ? `${r.ref} — ${r.name}` : "Not found" };
}

export default async function DepositPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);

  const deposit = await getDeposit(me, id);
  if (!deposit) notFound();

  const [ledger, companies, owners] = await Promise.all([
    ledgerFor(id),
    sql<{ id: number; name: string }>`select id, name from crm_companies order by name`,
    sql<{ id: number; full_name: string }>`select id, full_name from users where status = 'active' order by full_name`,
  ]);

  const funded = Number(deposit.funded);
  const drawn = Number(deposit.drawn);
  const balance = Number(deposit.balance);
  const left = remainingRatio(funded, balance);
  const empty = balance <= 0;
  const low = !empty && left <= Number(deposit.low_balance_ratio);
  const manage = can(me, "deposit.manage") && deposit.status === "active";

  return (
    <>
      <Link href="/deposits" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
        ← Back to deposit accounts
      </Link>

      <PageHeader
        title={deposit.company}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge value={deposit.status} />
            {empty && <Badge value="rejected" label="Exhausted" />}
            {low && <Badge value="high" label="Running low" />}
            <span>
              {deposit.ref} · {deposit.name} · opened {fmtDate(deposit.opened_on)}
            </span>
          </span>
        }
      >
        {manage && (
          <>
            <Dialog label="Record funding" variant="outline" title="Record funding received" width="max-w-lg">
              <FundingForm depositId={id} currency={deposit.currency} />
            </Dialog>
            <Dialog label={<><Icon name="plus" /> Record drawdown</>} title="Record a drawdown" width="max-w-2xl">
              <DrawdownForm depositId={id} currency={deposit.currency} balance={balance} />
            </Dialog>
          </>
        )}
        {can(me, "deposit.adjust") && (
          <Dialog label="Adjust" variant="ghost" title="Refund or correction" width="max-w-lg">
            <AdjustmentForm depositId={id} currency={deposit.currency} />
          </Dialog>
        )}
        {can(me, "deposit.manage") && (
          <Dialog label="Edit" variant="ghost" title="Edit the account" width="max-w-xl">
            <DepositForm
              companies={companies}
              owners={owners}
              deposit={{
                id: deposit.id,
                company_id: deposit.company_id,
                name: deposit.name,
                currency: deposit.currency,
                owner_id: deposit.owner_id,
                notes: deposit.notes,
                low_balance_ratio: deposit.low_balance_ratio,
                status: deposit.status,
              }}
            />
          </Dialog>
        )}
      </PageHeader>

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Funded" value={money(funded, deposit.currency)} />
        <Stat label="Drawn down" value={money(drawn, deposit.currency)} tone="sky" hint={`${deposit.drawdowns} drawdown${deposit.drawdowns === 1 ? "" : "s"}`} />
        <Stat
          label="Remaining"
          value={money(balance, deposit.currency)}
          tone={empty ? "rose" : low ? "amber" : "emerald"}
          hint={`${Math.round(left * 100)}% of what was funded`}
        />
        <Stat label="Last movement" value={deposit.last_movement_on ? fmtDate(deposit.last_movement_on) : "—"} />
      </div>

      <div className="mb-6">
        <span className="block h-2.5 overflow-hidden rounded-full bg-line">
          <span
            className={`block h-full rounded-full transition-all ${empty ? "bg-rose-500" : low ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.max(left > 0 ? 2 : 0, left * 100)}%` }}
          />
        </span>
        {empty && (
          <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset">
            This deposit is exhausted. Further drawdowns are refused until more funding is recorded.
          </p>
        )}
        {low && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset">
            Below the {Math.round(Number(deposit.low_balance_ratio) * 100)}% warning level. {deposit.owner ?? "The owner"} has been notified.
          </p>
        )}
      </div>

      <Card className="mb-6">
        <CardTitle
          action={
            <a
              href={`/api/export/crm-deposit-ledger?deposit=${id}`}
              className="text-xs font-bold text-brand-700 hover:underline"
            >
              Export CSV
            </a>
          }
        >
          Ledger
        </CardTitle>
        {ledger.length === 0 ? (
          <Empty title="Nothing posted yet" hint="Record the funding received, then draw it down as goods go out." />
        ) : (
          <Table head={["Date", "Reference", "What", "In", "Out", "Balance", "Recorded by", ""]}>
            {/*
              The running balance is computed down the page from the newest row,
              so each line shows the balance as it stood after that entry.
            */}
            {ledger.map((e, i) => {
              const after = ledger.slice(i).reduce((s, r) => s + Number(r.amount), 0);
              const amount = Number(e.amount);
              const kind = ENTRY_KINDS[e.kind] ?? { label: e.kind, direction: "out" as const };
              return (
                <tr key={e.id} className="align-top hover:bg-canvas">
                  <Td className="tabular whitespace-nowrap">{fmtDate(e.occurred_on)}</Td>
                  <Td className="tabular text-xs font-bold">
                    {e.ref}
                    {e.reference && <span className="block font-medium text-ink-soft">{e.reference}</span>}
                  </Td>
                  <Td>
                    <span className="block text-sm font-semibold">{e.description || kind.label}</span>
                    <span className="text-[11px] font-bold text-ink-soft uppercase">{kind.label}</span>
                    {e.items.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 border-l-2 border-line pl-2">
                        {e.items.map((it, n) => (
                          <li key={n} className="text-[11px] font-medium text-ink-soft">
                            {it.description} — {Number(it.quantity)} × {money(Number(it.unit_price), deposit.currency)} ={" "}
                            <span className="font-bold text-ink">{money(Number(it.line_total), deposit.currency)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.attachment_id && (
                      <a
                        href={`/api/files/${e.attachment_id}`}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:underline"
                      >
                        <Icon name="clip" className="h-3 w-3" />
                        {e.file_name ?? "Attachment"}
                      </a>
                    )}
                  </Td>
                  <Td className="tabular font-bold text-emerald-700">
                    {amount > 0 ? money(amount, deposit.currency) : ""}
                  </Td>
                  <Td className="tabular font-bold text-amber-700">
                    {amount < 0 ? money(-amount, deposit.currency) : ""}
                  </Td>
                  <Td className="tabular font-bold">{money(after, deposit.currency)}</Td>
                  <Td className="text-[11px] font-semibold text-ink-soft">
                    {e.recorded_by_name ?? "—"}
                    <span className="block">{fmtDateTime(e.created_at)}</span>
                  </Td>
                  <Td>
                    {can(me, "deposit.adjust") && (
                      <ActionForm action={deleteDepositEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <ConfirmBtn
                          title={`Remove ${e.ref}?`}
                          body="The entry is deleted and the balance recalculated. What it said is kept in the audit trail."
                          confirmLabel="Remove entry"
                        >
                          Remove
                        </ConfirmBtn>
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {deposit.notes && (
        <Card>
          <CardTitle>Notes</CardTitle>
          <p className="text-sm font-medium whitespace-pre-wrap">{deposit.notes}</p>
        </Card>
      )}
    </>
  );
}
