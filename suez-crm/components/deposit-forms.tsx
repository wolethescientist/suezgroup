"use client";

import { useState } from "react";
import { ActionForm, Select, SubmitBtn } from "@/components/form";
import { Field, Row } from "@/components/ui";
import { LineEditor } from "@/components/line-editor";
import { saveDeposit, recordDrawdown, recordFunding, adjustDeposit } from "@/lib/actions/deposits";

type Option = { id: number; name?: string; full_name?: string };

const today = () => new Date().toISOString().slice(0, 10);

/** Opening an account, and editing one. */
export function DepositForm({
  companies,
  owners,
  deposit,
}: {
  companies: Option[];
  owners: Option[];
  deposit?: {
    id: number; company_id: number; name: string; currency: string; owner_id: number | null;
    notes: string | null; low_balance_ratio: string; status: string;
  };
}) {
  return (
    <ActionForm action={saveDeposit} className="space-y-4">
      {deposit && <input type="hidden" name="id" value={deposit.id} />}

      <Row>
        <Field label="Customer">
          <Select name="company_id" required className="field" defaultValue={String(deposit?.company_id ?? "")} disabled={!!deposit}>
            <option value="">Choose…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Currency">
          <Select name="currency" className="field" defaultValue={deposit?.currency ?? "NGN"}>
            {["NGN", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
      </Row>

      <Field label="What the money is for" hint="e.g. Street lighting supply 2026">
        <input name="name" required defaultValue={deposit?.name ?? ""} className="field" />
      </Field>

      {!deposit && (
        <div className="rounded-2xl bg-canvas p-4">
          <p className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">Opening funding</p>
          <Row>
            <Field label="Amount received" hint="Leave blank if the money has not landed yet.">
              <input name="opening_amount" type="number" step="0.01" min="0" className="field tabular" placeholder="500000000" />
            </Field>
            <Field label="Date received">
              <input name="opening_date" type="date" defaultValue={today()} className="field" />
            </Field>
          </Row>
          <Field label="Their reference" hint="Payment advice or transfer reference.">
            <input name="opening_reference" className="field" />
          </Field>
        </div>
      )}

      <Row>
        <Field label="Account owner">
          <Select name="owner_id" className="field" defaultValue={String(deposit?.owner_id ?? "")}>
            <option value="">Me</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Warn me below" hint="Percent of the funded amount.">
          <input
            name="low_balance_percent"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={deposit ? Math.round(Number(deposit.low_balance_ratio) * 100) : 10}
            className="field tabular"
          />
        </Field>
      </Row>

      {deposit && (
        <Field label="Status">
          <Select name="status" className="field" defaultValue={deposit.status}>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
      )}

      <Field label="Notes">
        <textarea name="notes" rows={2} defaultValue={deposit?.notes ?? ""} className="field resize-y" />
      </Field>

      <SubmitBtn className="w-full">{deposit ? "Save changes" : "Open account"}</SubmitBtn>
    </ActionForm>
  );
}

/** Money in. */
export function FundingForm({ depositId, currency }: { depositId: number; currency: string }) {
  return (
    <ActionForm action={recordFunding} className="space-y-4" reset>
      <input type="hidden" name="deposit_id" value={depositId} />
      <Row>
        <Field label={`Amount received (${currency})`}>
          <input name="amount" type="number" step="0.01" min="0.01" required className="field tabular" />
        </Field>
        <Field label="Date received">
          <input name="occurred_on" type="date" defaultValue={today()} className="field" />
        </Field>
      </Row>
      <Field label="Description">
        <input name="description" className="field" placeholder="Second tranche" />
      </Field>
      <Field label="Their reference" hint="Payment advice or transfer reference.">
        <input name="reference" className="field" />
      </Field>
      <Field label="Evidence" hint="Optional — the payment advice, up to 20 MB.">
        <input type="file" name="attachment" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" />
      </Field>
      <SubmitBtn className="w-full">Record funding</SubmitBtn>
    </ActionForm>
  );
}

/**
 * Goods out.
 *
 * Itemised by default, because "they request light units" is a schedule — what
 * was supplied, how many, at what price — and a single total throws away the
 * only record of it.
 */
export function DrawdownForm({
  depositId,
  currency,
  balance,
}: {
  depositId: number;
  currency: string;
  balance: number;
}) {
  const [itemised, setItemised] = useState(true);

  return (
    <ActionForm action={recordDrawdown} className="space-y-4" reset>
      <input type="hidden" name="deposit_id" value={depositId} />

      <p className="rounded-xl bg-canvas px-3 py-2 text-xs font-semibold text-ink-soft">
        {balance > 0
          ? `${currency} ${balance.toLocaleString()} available. A drawdown larger than that is refused.`
          : "This account has no funds left. Record further funding before drawing on it."}
      </p>

      <Field label="What was supplied">
        <input name="description" className="field" placeholder="Solar street light units — batch 3" />
      </Field>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
        <input
          type="checkbox"
          checked={itemised}
          onChange={(e) => setItemised(e.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        Itemise the units
      </label>

      {itemised ? (
        <LineEditor />
      ) : (
        <Field label={`Amount (${currency})`}>
          <input name="amount" type="number" step="0.01" min="0.01" className="field tabular" />
        </Field>
      )}

      <Row>
        <Field label="Date supplied">
          <input name="occurred_on" type="date" defaultValue={today()} className="field" />
        </Field>
        <Field label="Their reference" hint="Their PO or your waybill number.">
          <input name="reference" className="field" />
        </Field>
      </Row>

      <Field label="Evidence" hint="Optional — signed waybill or delivery note.">
        <input type="file" name="attachment" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" />
      </Field>

      <SubmitBtn className="w-full">Record drawdown</SubmitBtn>
    </ActionForm>
  );
}

/** A refund out, or a correction either way. */
export function AdjustmentForm({ depositId, currency }: { depositId: number; currency: string }) {
  const [kind, setKind] = useState("refund");

  return (
    <ActionForm action={adjustDeposit} className="space-y-4" reset>
      <input type="hidden" name="deposit_id" value={depositId} />
      <Field label="Type">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="field">
          <option value="refund">Refund to the customer</option>
          <option value="adjustment">Correction</option>
        </select>
      </Field>

      {kind === "adjustment" && (
        <Field label="Direction">
          <Select name="direction" className="field" defaultValue="in">
            <option value="in">Add to the balance</option>
            <option value="out">Take off the balance</option>
          </Select>
        </Field>
      )}

      <Row>
        <Field label={`Amount (${currency})`}>
          <input name="amount" type="number" step="0.01" min="0.01" required className="field tabular" />
        </Field>
        <Field label="Date">
          <input name="occurred_on" type="date" defaultValue={today()} className="field" />
        </Field>
      </Row>

      <Field label="Reason" hint="Required. It goes on the ledger and into the audit trail.">
        <textarea name="description" rows={2} required className="field resize-y" />
      </Field>
      <Field label="Reference">
        <input name="reference" className="field" />
      </Field>

      <SubmitBtn className="w-full">Post entry</SubmitBtn>
    </ActionForm>
  );
}
