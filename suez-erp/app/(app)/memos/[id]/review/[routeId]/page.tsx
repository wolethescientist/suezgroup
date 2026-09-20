import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { getOrg, getSigningSettings } from "@/lib/settings";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { decideRoute, saveRouteSignaturePlacement } from "@/lib/actions/documents";
import { askNeedsSignature, askVerb } from "@/lib/documents";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Field } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { SignaturePlacement } from "@/components/signature-placement";

export const metadata = { title: "Review document" };

/** A reviewer's own print preview, including their freely positioned signature. */
export default async function RoutedDocumentReview({
  params,
}: {
  params: Promise<{ id: string; routeId: string }>;
}) {
  const me = await requireUser();
  const { id: memoIdText, routeId: routeIdText } = await params;
  const memoId = Number(memoIdText); const routeId = Number(routeIdText);
  if (!memoId || !routeId) notFound();

  const [route] = await sql<{
    id: number; ref: string; memo_id: number; sender_id: number; recipient_id: number; ask: string; status: string;
    instructions: string | null; due_date: string | null; decision_note: string | null; decided_at: string | null;
    signature_ref: string | null; signature_sha256: string | null; signature_placement: { x?: number; y?: number } | null;
    title: string; body: string; body_html: string | null; kind: string; version: number; memo_ref: string;
    author: string; author_title: string | null; author_signature_ref: string | null;
    recipient: string; recipient_title: string | null;
  }>`
    select r.id, r.ref, r.memo_id, r.sender_id, r.recipient_id, r.ask, r.status, r.instructions, r.due_date,
           r.decision_note, r.decided_at, r.signature_ref, r.signature_sha256, r.signature_placement,
           m.title, m.body, m.body_html, m.kind, m.version, m.ref as memo_ref,
           author.full_name as author, author.job_title as author_title, m.author_signature_ref,
           recipient.full_name as recipient, recipient.job_title as recipient_title
      from document_routes r
      join memos m on m.id = r.memo_id
      join users author on author.id = m.author_id
      join users recipient on recipient.id = r.recipient_id
     where r.id = ${routeId} and r.memo_id = ${memoId}`;
  if (!route || (route.recipient_id !== me.id && route.sender_id !== me.id)) notFound();

  const [org, settings] = await Promise.all([getOrg(), getSigningSettings()]);
  const signing = askNeedsSignature(route.ask);
  const canDecide = route.recipient_id === me.id && route.status === "pending";
  const signature = route.status === "approved" ? route.signature_ref : me.signature;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/memos/${memoId}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">← Back to document</Link>
        <PrintButton label="Download / export PDF" />
      </div>

      <article className="card mx-auto max-w-3xl p-8 leading-relaxed print:border-0 print:shadow-none sm:p-12">
        <header className="border-b-2 border-ink pb-4">
          <p className="text-xl font-bold">{org.name}</p>
          {org.address && <p className="text-xs font-medium text-ink-soft">{org.address}</p>}
          {(org.phone || org.email) && <p className="text-xs font-medium text-ink-soft">{[org.phone, org.email].filter(Boolean).join(" · ")}</p>}
        </header>
        <h1 className="mt-6 text-center text-sm font-bold tracking-[0.2em] uppercase">{titleCase(route.kind)}</h1>
        <dl className="mt-6 space-y-1.5 border-y border-line py-4 text-sm">
          {[["Reference", route.memo_ref], ["Review", route.ref], ["Date", fmtDate(route.decided_at ?? new Date())], ["From", route.author], ["To", route.recipient], ["Requested action", askVerb(route.ask)]].map(([label, value]) => (
            <div key={label} className="flex gap-3"><dt className="w-32 shrink-0 text-[11px] font-bold tracking-wider text-ink-soft uppercase">{label}</dt><dd className="flex-1 font-semibold">{value}</dd></div>
          ))}
        </dl>
        <h2 className="mt-7 text-lg font-bold">{route.title}</h2>
        {route.instructions && <blockquote className="mt-4 border-l-2 border-brand-300 pl-3 text-sm font-medium text-ink-soft italic">Review instruction: {route.instructions}</blockquote>}
        <div className="doc-body mt-6 text-[15px] font-medium" {...(route.body_html ? { dangerouslySetInnerHTML: { __html: sanitizeHtml(route.body_html) } } : { children: <p className="whitespace-pre-wrap">{route.body}</p> })} />

        {route.author_signature_ref && (
          <div className="mt-10 border-t border-line pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={route.author_signature_ref} alt={`${route.author} signature`} data-signature className="h-16 object-contain object-left p-1" />
            <p className="mt-1 text-sm font-bold">{route.author}</p><p className="text-xs font-medium text-ink-soft">{route.author_title ?? "Staff"}</p>
          </div>
        )}

        {signing && (
          <SignaturePlacement
            memoId={route.id}
            signature={signature}
            author={route.recipient}
            title={route.recipient_title}
            placement={route.signature_placement}
            editable={canDecide}
            action={saveRouteSignaturePlacement}
            placementNote="Drag your signature in the review preview, or append it at the bottom. Save its position, then approve and sign. Once decided, it is locked."
          />
        )}

        {canDecide && (
          <section className="mt-6 rounded-xl bg-brand-50 p-4 print:hidden">
            <h2 className="text-sm font-bold text-brand-900">Your decision</h2>
            <ActionForm action={decideRoute} className="mt-3 grid gap-3">
              <input type="hidden" name="id" value={route.id} />
              <Field label="Note" hint="Optional when approving. Required when rejecting."><textarea name="note" rows={3} className="field !bg-surface" /></Field>
              {signing && settings.require_password && me.signature && <Field label="Confirm your password to sign"><input name="password" type="password" autoComplete="current-password" className="field !bg-surface" /></Field>}
              <div className="flex flex-wrap gap-2">
                {(!signing || me.signature) ? <SubmitBtn name="decision" value="approved" variant="success">{signing ? "Approve & sign" : "Approve"}</SubmitBtn> : <a href="/settings/signature" className="rounded-xl bg-surface px-3.5 py-2 text-sm font-bold text-brand-800 ring-1 ring-brand-200 ring-inset">Add signature to approve</a>}
                <SubmitBtn name="decision" value="rejected" variant="outline">Reject</SubmitBtn>
              </div>
            </ActionForm>
          </section>
        )}
        {route.decision_note && <p className="mt-6 border-t border-line pt-4 text-sm"><strong>{route.status === "rejected" ? "Rejection:" : "Decision:"}</strong> {route.decision_note}</p>}
        {route.signature_sha256 && <p className="mt-3 font-mono text-[10px] text-ink-soft">Signature SHA-256 {route.signature_sha256}</p>}
        <footer className="mt-10 border-t border-line pt-4 text-[10px] font-medium text-ink-soft">{org.name} — document review record. Generated {fmtDateTime(new Date())} by {me.full_name}.</footer>
      </article>
    </>
  );
}
