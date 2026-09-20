"use client";

import { useState } from "react";
import { ActionForm, Select, SubmitBtn, type Action } from "@/components/form";
import { Field } from "@/components/ui";
import { workingDays } from "@/lib/format";

export function LeaveForm({
  action,
  types,
  colleagues,
}: {
  action: Action;
  types: { id: number; name: string; remaining: number; paid: boolean }[];
  colleagues: { id: number; full_name: string }[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [typeId, setTypeId] = useState(String(types[0]?.id ?? ""));

  const days = start && end ? workingDays(start, end) : 0;
  const picked = types.find((t) => String(t.id) === typeId);
  const over = picked && days > picked.remaining;

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-3">
      <div className="card space-y-4 p-5 lg:col-span-2">
        <Field label="Leave type">
          <select name="leave_type_id" required value={typeId} onChange={(e) => setTypeId(e.target.value)} className="field">
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.remaining} day{t.remaining === 1 ? "" : "s"} left
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day">
            <input type="date" name="start_date" required min={today} value={start} onChange={(e) => setStart(e.target.value)} className="field" />
          </Field>
          <Field label="Last day">
            <input type="date" name="end_date" required min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} className="field" />
          </Field>
        </div>

        <Field label="Reason" hint="Optional, but it helps your approver decide quickly.">
          <textarea name="reason" rows={4} placeholder="e.g. Family vacation" className="field resize-y" />
        </Field>

        <Field label="Handover to" hint="Who covers your duties while you are away?">
          <Select name="handover_to" className="field" defaultValue="">
            <option value="">Nobody assigned</option>
            {colleagues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Supporting document" hint="Optional — e.g. a medical report, up to 20 MB.">
          <input type="file" name="attachment" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" />
        </Field>
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Working days requested</p>
          <p className="mt-1 text-4xl font-bold tabular">{days}</p>
          <p className="mt-1 text-xs font-medium text-ink-soft">Weekends are excluded automatically.</p>

          {picked && (
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-ink-soft">Available</span>
                <span className="font-bold tabular">{picked.remaining}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-ink-soft">After this request</span>
                <span className={`font-bold tabular ${over ? "text-rose-600" : ""}`}>{picked.remaining - days}</span>
              </div>
            </div>
          )}

          {over && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              That is more than your remaining entitlement.
            </p>
          )}
        </div>

        <div className="card p-5">
          <SubmitBtn className="w-full">Submit request</SubmitBtn>
          <p className="mt-2 text-center text-xs font-medium text-ink-soft">
            Routed to your line manager, or HR if you have none.
          </p>
        </div>
      </div>
    </ActionForm>
  );
}
