import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { getOrg } from "@/lib/settings";
import { KIND_HEADING, canEditMemo, canViewDelivery, canViewMemo } from "@/lib/memos";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { saveMemoSignaturePlacement, updateMemo } from "@/lib/actions/memos";
import { prettySize } from "@/lib/attachments";
import { PrintButton } from "@/components/print-button";
import { DocumentEditable } from "@/components/document-editable";
import { SignaturePlacement } from "@/components/signature-placement";

export const metadata = { title: "Document" };

/**
 * The document itself — read it, review it, edit it, print it.
 *
 * ponytail: this was print-only. You could see how a document would look but
 * not change a word of it, because nothing in the system could edit a memo
 * after it was composed. Editing now happens here rather than on a separate
 * form, so what is being corrected is the document as it will be issued.
 */
export default async function MemoDocument({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [memo] = await sql<{
    id: number; ref: string; kind: string; title: string; body: string; body_html: string | null;
    priority: string; audience: string; status: string; requires_ack: boolean; version: number;
    published_at: string | null; updated_at: string | null; updated_by_name: string | null;
    created_at: string; author_id: number; author: string; author_title: string | null;
    author_dept: string | null; author_signature: string | null;
    author_signature_ref: string | null; author_signature_sha256: string | null;
    author_signature_placement: { x?: number; y?: number } | null;
    department: string | null; file_id: number | null; file_name: string | null; file_size: number | null;
  }>`
    select m.id, m.ref, m.kind, m.title, m.body, m.body_html, m.priority, m.audience, m.status,
           m.requires_ack, m.version, m.published_at, m.updated_at, m.created_at, m.author_id,
           m.author_signature_ref, m.author_signature_sha256, m.author_signature_placement,
           u.full_name as author, u.job_title as author_title, u.signature as author_signature,
           ad.name as author_dept, d.name as department, ub.full_name as updated_by_name,
           a.id as file_id, a.name as file_name, a.size_bytes as file_size
      from memos m
      join users u on u.id = m.author_id
      left join departments ad on ad.id = u.department_id
      left join departments d on d.id = m.department_id
      left join users ub on ub.id = m.updated_by
      left join attachments a on a.id = m.attachment_id
     where m.id = ${id}`;
  if (!memo) notFound();

  const [mine] = await sql<{ acknowledged_at: string | null }>`
    select acknowledged_at from memo_recipients where memo_id = ${id} and user_id = ${me.id}`;
  if (!canViewMemo(memo, !!mine, me)) notFound();

  const [stats] = canViewDelivery(memo, me)
    ? await sql<{ reach: number; reads: number; acks: number }>`
        select count(*)::int as reach,
               count(read_at)::int as reads,
               count(acknowledged_at)::int as acks
          from memo_recipients where memo_id = ${id}`
    : [null];

  // History is the author's and HR's business, not every recipient's.
  const history = canViewDelivery(memo, me)
    ? await sql<{ version: number; note: string | null; published_at: string | null; by: string | null }>`
        select v.version, v.note, v.published_at, u.full_name as by
          from memo_versions v
          left join users u on u.id = v.created_by
         where v.memo_id = ${id}
         order by v.version desc`
    : [];

  const org = await getOrg();
  const isDraft = memo.status === "draft";
  const signature = isDraft ? memo.author_signature : memo.author_signature_ref;
  const canEdit = canEditMemo(memo, me);

  const to =
    memo.audience === "all"
      ? "All Staff"
      : memo.audience === "department"
        ? `${memo.department} Department`
        : "Selected Recipients";

  // Sanitised again on the way out. It was sanitised on the way in, so this is
  // belt and braces — but the cost is a string pass and the failure is stored XSS.
  const bodyHtml = sanitizeHtml(memo.body_html ?? "");

  const meta: [string, string][] = [
    ["Ref", memo.version > 1 ? `${memo.ref} · v${memo.version}` : memo.ref],
    ["Date", memo.published_at ? fmtDate(memo.published_at) : `${fmtDate(memo.created_at)} (drafted)`],
    ["To", to],
    [
      "From",
      `${memo.author}${memo.author_title ? `, ${memo.author_title}` : ""}${memo.author_dept ? ` — ${memo.author_dept}` : ""}`,
    ],
    ...(memo.priority !== "normal" ? ([["Priority", titleCase(memo.priority)]] as [string, string][]) : []),
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/memos/${id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
          ← Back to document view
        </Link>
        <PrintButton />
      </div>

      <article className="card mx-auto max-w-3xl p-8 leading-relaxed print:border-0 print:shadow-none sm:p-12">
        <header className="border-b-2 border-ink pb-4">
          <p className="text-xl font-bold">{org.name}</p>
          {org.address && <p className="text-xs font-medium text-ink-soft">{org.address}</p>}
          {(org.phone || org.email) && (
            <p className="text-xs font-medium text-ink-soft">
              {[org.phone, org.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </header>

        <h1 className="mt-6 text-center text-sm font-bold tracking-[0.2em] uppercase">
          {KIND_HEADING[memo.kind] ?? titleCase(memo.kind)}
        </h1>

        {isDraft && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-800 ring-1 ring-amber-200 ring-inset">
            DRAFT — not yet published
          </p>
        )}

        {memo.version > 1 && (
          <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-center text-xs font-bold text-ink-soft">
            Revision {memo.version}
            {memo.updated_at ? ` — issued ${fmtDate(memo.updated_at)}` : ""}
            {memo.updated_by_name ? ` by ${memo.updated_by_name}` : ""}
          </p>
        )}

        <DocumentEditable
          action={updateMemo}
          id={memo.id}
          title={memo.title}
          bodyHtml={bodyHtml}
          bodyText={memo.body}
          status={memo.status}
          version={memo.version}
          requiresAck={memo.requires_ack}
          canEdit={canEdit}
          meta={meta}
        >
          {memo.file_id && (
            <p className="mt-6 text-xs font-semibold text-ink-soft">
              Attachment: {memo.file_name} ({prettySize(memo.file_size ?? 0)})
            </p>
          )}

          <SignaturePlacement
            memoId={memo.id}
            signature={signature}
            author={memo.author}
            title={memo.author_title}
            placement={memo.author_signature_placement}
            editable={isDraft && memo.author_id === me.id}
            action={saveMemoSignaturePlacement}
          />
        </DocumentEditable>

        <footer className="mt-10 border-t border-line pt-4 text-[10px] leading-relaxed font-medium text-ink-soft">
          {memo.author_signature_sha256 && !isDraft && (
            <p className="font-mono">Signature SHA-256 {memo.author_signature_sha256}</p>
          )}
          {memo.requires_ack && <p>This document requires written acknowledgement by every recipient.</p>}
          {stats && (
            <p>
              Distribution: {stats.reach} recipient{stats.reach === 1 ? "" : "s"} · {stats.reads} read
              {memo.requires_ack ? ` · ${stats.acks} signed` : ""}
            </p>
          )}
          <p className="mt-1">
            {org.name} — internal document. Printed {fmtDateTime(new Date())} by {me.full_name}.
          </p>
        </footer>
      </article>

      {history.length > 1 && (
        <section className="card mx-auto mt-6 max-w-3xl p-6 print:hidden">
          <h2 className="mb-3 text-xs font-bold tracking-wider text-ink-soft uppercase">Revision history</h2>
          <ol className="space-y-2.5">
            {history.map((v) => (
              <li key={v.version} className="flex gap-3 text-sm">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                    v.version === memo.version ? "bg-brand-100 text-brand-800" : "bg-canvas text-ink-soft"
                  }`}
                >
                  v{v.version}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{v.note ?? (v.version === 1 ? "First issued" : "Revised")}</span>
                  <span className="block text-xs font-medium text-ink-soft">
                    {v.published_at ? fmtDateTime(v.published_at) : "—"}
                    {v.by ? ` · ${v.by}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs font-medium text-ink-soft">
            Each version is kept as it was issued. Signatures stay attached to the version they were given for.
          </p>
        </section>
      )}
    </>
  );
}
