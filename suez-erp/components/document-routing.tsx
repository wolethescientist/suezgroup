"use client";

import { useState } from "react";
import { ActionForm, Dialog, Select, SubmitBtn, type Action } from "@/components/form";
import { Field } from "@/components/ui";
import { ASKS, askNeedsSignature } from "@/lib/documents";

export type Recipient = {
  id: number;
  full_name: string;
  job_title: string | null;
  department: string | null;
  role_name: string;
  /** Head of their department — the person most routing is aimed at. */
  is_head: boolean;
};

/**
 * Sending a document for a decision.
 *
 * People are picked by access level first and by name second, because the
 * sender usually knows they need "a head of department" and not which one. The
 * list is grouped rather than filtered so an unusual choice is still one click
 * away.
 */
export function RouteDocument({
  action,
  memoId,
  people,
  levels,
}: {
  action: Action;
  memoId: number;
  people: Recipient[];
  levels: { key: string; name: string }[];
}) {
  const [level, setLevel] = useState("");
  const [ask, setAsk] = useState<string>("approve_sign");
  const [picked, setPicked] = useState<number[]>([]);

  const shown =
    level === "heads"
      ? people.filter((p) => p.is_head)
      : level
        ? people.filter((p) => p.role_name === level)
        : people;

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Dialog
      label="Send for approval"
      title="Send this document for approval"
      description="It goes to their inbox with your instruction, and comes back to you decided."
      width="max-w-xl"
    >
      <ActionForm action={action} className="grid gap-4">
        <input type="hidden" name="memo_id" value={memoId} />

        <Field label="What should they do with it?">
          <Select name="ask" className="field" defaultValue="approve_sign" onChange={(e) => setAsk(e.target.value)}>
            {ASKS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </Select>
          <p className="mt-1 text-[11px] font-medium text-ink-soft">
            {ASKS.find((a) => a.key === ask)?.hint}
          </p>
        </Field>

        <Field label="Access level" hint="Narrows the list below. Not sent to the level itself.">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="field">
            <option value="">Everyone</option>
            <option value="heads">Heads of department</option>
            {levels.map((l) => (
              <option key={l.key} value={l.name}>{l.name}</option>
            ))}
          </select>
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-bold text-ink-soft">
            Send to {picked.length > 0 && <span className="text-brand-700">({picked.length} selected)</span>}
          </p>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
            {shown.length === 0 && (
              <p className="px-2 py-3 text-xs font-medium text-ink-soft">Nobody holds that access level yet.</p>
            )}
            {shown.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-canvas"
              >
                <input
                  type="checkbox"
                  name="recipient_id"
                  value={p.id}
                  checked={picked.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="min-w-0 flex-1 truncate">
                  {p.full_name}
                  {p.is_head && <span className="ml-1.5 text-[10px] font-bold text-brand-700 uppercase">head</span>}
                </span>
                <span className="shrink-0 text-[11px] font-medium text-ink-soft">
                  {p.job_title ?? p.role_name}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Field label="Instruction" hint="Say plainly what you want done — this is what they see first.">
          <textarea
            name="instructions"
            rows={3}
            className="field"
            maxLength={600}
            placeholder="Please review clause 4, approve and sign, and send it back to me for filing."
          />
        </Field>

        <Field label="Needed by" hint="Optional.">
          <input type="date" name="due_date" className="field" />
        </Field>

        {askNeedsSignature(ask) && (
          <p className="rounded-xl bg-canvas px-3 py-2 text-[11px] font-semibold text-ink-soft">
            They must have a signature saved under Settings → Signature. The signature is copied and hashed
            against the wording as it stands now.
          </p>
        )}

        <SubmitBtn>Send</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/**
 * The recipient's decision panel. Approve or reject — nothing in between, which
 * is what was asked for.
 */
export function RouteDecision({
  action,
  route,
  requirePassword,
  hasSignature,
  previewHref,
}: {
  action: Action;
  route: { id: number; ref: string; ask: string; instructions: string | null; sender: string; due_date: string | null };
  requirePassword: boolean;
  hasSignature: boolean;
  previewHref?: string;
}) {
  const signing = askNeedsSignature(route.ask);
  const blocked = signing && !hasSignature;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        <strong>{route.sender}</strong> has sent you this document to{" "}
        {ASKS.find((a) => a.key === route.ask)?.verb ?? "review"}.
      </p>
      {route.instructions && (
        <blockquote className="border-l-2 border-brand-300 pl-3 text-sm font-medium text-ink-soft italic">
          {route.instructions}
        </blockquote>
      )}
      {route.due_date && (
        <p className="text-[11px] font-bold text-amber-700 uppercase">Needed by {route.due_date}</p>
      )}
      {signing && previewHref && (
        <a href={previewHref} className="block rounded-xl bg-surface p-3 text-sm font-bold text-brand-700 ring-1 ring-brand-200 ring-inset">
          Open signature preview — drag or append your signature →
        </a>
      )}

      {blocked ? (
        <a href="/settings/signature" className="block rounded-xl bg-surface p-3 text-sm font-bold text-brand-700 ring-1 ring-brand-200 ring-inset">
          Add your signature before signing this →
        </a>
      ) : (
        <ActionForm action={action} className="grid gap-3">
          <input type="hidden" name="id" value={route.id} />
          <textarea
            name="note"
            rows={3}
            className="field"
            placeholder="Optional when approving. Required when rejecting."
          />
          {signing && requirePassword && (
            <Field label="Confirm your password to sign">
              <input name="password" type="password" autoComplete="current-password" placeholder="••••••••" className="field" />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <SubmitBtn name="decision" value="approved" variant="success">
              {signing ? "Approve & sign" : "Approve"}
            </SubmitBtn>
            <SubmitBtn name="decision" value="rejected" variant="outline">Reject</SubmitBtn>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
