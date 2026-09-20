import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money } from "@/lib/format";
import { Badge, Card, CardTitle, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, SubmitBtn } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { QuoteForm } from "@/components/sales-forms";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { canEditOwned } from "@/lib/permissions";
import { deleteQuote, reviseQuote, setQuoteStatus, updateQuote } from "@/lib/actions/sales";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string; title: string }>`select ref, title from crm_quotes where id = ${Number(id)}`;
  return { title: r ? `${r.ref} — ${r.title}` : "Not found" };
}

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;

  const [q] = await sql<{
    id: number; ref: string; title: string; company: string | null; contact: string | null; deal_id: number | null;
    deal: string | null; issue_date: string; valid_until: string | null; currency: string; subtotal: string;
    discount: string; tax_rate: string; tax_amount: string; total: string; status: string; terms: string | null;
    terms_html: string | null; owner: string | null; owner_id: number | null; company_id: number | null;
    contact_id: number | null; version: number; updated_at: string | null; superseded_at: string | null;
    supersedes_id: number | null; supersedes_ref: string | null; replaced_by_id: number | null; replaced_by_ref: string | null;
  }>`
    select q.*, c.name as company, ct.full_name as contact, d.title as deal, u.full_name as owner,
           prev.ref as supersedes_ref, nextq.id as replaced_by_id, nextq.ref as replaced_by_ref
      from crm_quotes q
      left join crm_companies c on c.id = q.company_id
      left join crm_contacts ct on ct.id = q.contact_id
      left join crm_deals d on d.id = q.deal_id
      left join users u on u.id = q.owner_id
      left join crm_quotes prev on prev.id = q.supersedes_id
      left join crm_quotes nextq on nextq.supersedes_id = q.id
     where q.id = ${Number(id)}`;
  if (!q) notFound();

  const lines = await sql<{ id: number; description: string; quantity: string; unit_price: string; line_total: string }>`
    select * from crm_quote_lines where quote_id = ${q.id} order by id`;

  const history = await sql<{ version: number; note: string | null; total: string; created_at: string; by: string | null }>`
    select v.version, v.note, v.total, v.created_at, u.full_name as by
      from crm_quote_versions v
      left join users u on u.id = v.created_by
     where v.quote_id = ${q.id}
     order by v.version desc`;

  const mine = canEditOwned(me, q.owner_id);
  // A draft is corrected, a sent quote is revised into a new version, and a
  // closed one is replaced by a successor with its own reference.
  const open = q.status === "draft" || q.status === "sent";
  const canRevise = mine && !open && !q.replaced_by_id;
  const termsHtml = sanitizeHtml(q.terms_html ?? "");

  return (
    <>
      <PageHeader title={q.ref} subtitle={`${q.title} · ${q.company ?? "no client"}${q.contact ? ` · ${q.contact}` : ""}`}>
        <Badge value={q.status} />
        {q.version > 1 && <Badge value="high" label={`Version ${q.version}`} />}
        <PrintButton />
        {mine && open && (
          <QuoteForm
            action={updateQuote}
            companies={[]}
            contacts={[]}
            deals={[]}
            quote={{
              id: q.id, title: q.title, company_id: q.company_id, contact_id: q.contact_id, deal_id: q.deal_id,
              issue_date: q.issue_date?.slice(0, 10), valid_until: q.valid_until?.slice(0, 10) ?? null,
              currency: q.currency, discount: q.discount, tax_rate: q.tax_rate, terms: q.terms,
              terms_html: q.terms_html, status: q.status, version: q.version,
            }}
            lines={lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price }))}
          />
        )}
        {canRevise && (
          <ActionForm action={reviseQuote}>
            <input type="hidden" name="id" value={q.id} />
            <SubmitBtn variant="outline">Raise revised quote</SubmitBtn>
          </ActionForm>
        )}
        {q.status === "draft" && (
          <ActionForm action={setQuoteStatus}>
            <input type="hidden" name="id" value={q.id} />
            <input type="hidden" name="status" value="sent" />
            <SubmitBtn>Mark as sent</SubmitBtn>
          </ActionForm>
        )}
        {q.status === "sent" && (
          <>
            {/* Separate forms — a submit button's name/value does not reach the action
                across the server/client boundary. */}
            <ActionForm action={setQuoteStatus}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="status" value="accepted" />
              <SubmitBtn>Accepted</SubmitBtn>
            </ActionForm>
            <ActionForm action={setQuoteStatus}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="status" value="declined" />
              <SubmitBtn variant="ghost">Declined</SubmitBtn>
            </ActionForm>
          </>
        )}
      </PageHeader>

      {(q.supersedes_id || q.replaced_by_id) && (
        <Card className="mb-5 !bg-canvas">
          <p className="text-sm font-semibold">
            {q.replaced_by_id ? (
              <>
                This quote was replaced by{" "}
                <Link href={`/quotes/${q.replaced_by_id}`} className="font-bold text-brand-700 hover:underline">
                  {q.replaced_by_ref}
                </Link>
                . It is kept as the record of what was quoted at the time.
              </>
            ) : (
              <>
                Raised to replace{" "}
                <Link href={`/quotes/${q.supersedes_id}`} className="font-bold text-brand-700 hover:underline">
                  {q.supersedes_ref}
                </Link>
                , which keeps its own reference.
              </>
            )}
          </p>
        </Card>
      )}

      <Card>
        <CardTitle action={<span className="text-xs font-semibold text-ink-soft">Prepared by {q.owner ?? "—"}</span>}>Quotation</CardTitle>
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Issued", fmtDate(q.issue_date)],
            ["Valid until", fmtDate(q.valid_until)],
            ["Opportunity", q.deal ?? "—"],
            ["Currency", q.currency],
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
              <Td className="tabular">{money(l.unit_price, q.currency)}</Td>
              <Td className="tabular font-bold">{money(l.line_total, q.currency)}</Td>
            </tr>
          ))}
        </Table>

        <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="font-semibold text-ink-soft">Subtotal</dt><dd className="tabular font-bold">{money(q.subtotal, q.currency)}</dd></div>
          {Number(q.discount) > 0 && (
            <div className="flex justify-between"><dt className="font-semibold text-ink-soft">Discount</dt><dd className="tabular font-bold">−{money(q.discount, q.currency)}</dd></div>
          )}
          <div className="flex justify-between"><dt className="font-semibold text-ink-soft">VAT ({Number(q.tax_rate)}%)</dt><dd className="tabular font-bold">{money(q.tax_amount, q.currency)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1.5 text-base"><dt className="font-bold">Total</dt><dd className="tabular font-bold">{money(q.total, q.currency)}</dd></div>
        </dl>

        {(termsHtml || q.terms) && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Terms</p>
            {/* Sanitised on write and again here: the failure mode is stored XSS. */}
            {termsHtml ? (
              <div className="doc-body mt-1 text-sm font-medium" dangerouslySetInnerHTML={{ __html: termsHtml }} />
            ) : (
              <p className="mt-1 text-sm font-medium whitespace-pre-wrap">{q.terms}</p>
            )}
          </div>
        )}
      </Card>

      {history.length > 1 && (
        <Card className="mt-5 print:hidden">
          <CardTitle>Revision history</CardTitle>
          <ol className="space-y-2.5">
            {history.map((v) => (
              <li key={v.version} className="flex gap-3 text-sm">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                    v.version === q.version ? "bg-brand-100 text-brand-800" : "bg-canvas text-ink-soft"
                  }`}
                >
                  v{v.version}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{v.note ?? (v.version === 1 ? "First sent" : "Revised")}</span>
                  <span className="block text-xs font-medium text-ink-soft">
                    {fmtDate(v.created_at)}
                    {v.by ? ` · ${v.by}` : ""}
                  </span>
                </span>
                <span className="tabular shrink-0 text-xs font-bold text-ink-soft">{money(v.total, q.currency)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs font-medium text-ink-soft">
            Each version is kept as it was sent, with its own figures. The customer holds whichever one they were sent.
          </p>
        </Card>
      )}

      <div className="mt-5 flex items-center justify-between print:hidden">
        <Link href="/quotes" className="text-xs font-bold text-brand-700 hover:underline">← All quotes</Link>
        <ActionForm action={deleteQuote}>
          <input type="hidden" name="id" value={q.id} />
          <ConfirmBtn title={`Delete ${q.ref}?`}
                      body="The quote and its lines are removed. An accepted quote cannot be deleted at all."
                      confirmLabel="Delete quote">
            Delete quote
          </ConfirmBtn>
        </ActionForm>
      </div>
    </>
  );
}
