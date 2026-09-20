import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money } from "@/lib/format";
import { Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { QuoteForm } from "@/components/sales-forms";
import { createQuote } from "@/lib/actions/sales";

export const metadata = { title: "Quotes" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { status = "" } = await searchParams;

  // Expiry is derived at read time so a quote never looks live past its date.
  const rows = await sql<{ id: number; ref: string; title: string; company: string | null; issue_date: string; valid_until: string | null; total: string; currency: string; status: string; owner: string | null }>`
    select q.id, q.ref, q.title, c.name as company, q.issue_date, q.valid_until, q.total, q.currency,
           case when q.status = 'sent' and q.valid_until is not null and q.valid_until < current_date then 'expired' else q.status end as status,
           u.full_name as owner
      from crm_quotes q
      left join crm_companies c on c.id = q.company_id
      left join users u on u.id = q.owner_id
     where (${status} = '' or q.status = ${status})
     order by q.issue_date desc, q.id desc limit 200`;

  const [stats] = await sql<{ open: string; accepted: string; n: number }>`
    select coalesce(sum(total) filter (where status in ('draft','sent')), 0) as open,
           coalesce(sum(total) filter (where status = 'accepted'), 0) as accepted,
           count(*)::int as n from crm_quotes`;

  const [companies, contacts, deals] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from crm_companies order by name limit 500`,
    sql<{ id: number; full_name: string }>`select id, full_name from crm_contacts order by full_name limit 500`,
    sql<{ id: number; title: string }>`select id, title from crm_deals where stage not in ('won','lost') order by title limit 300`,
  ]);

  return (
    <>
      <PageHeader title="Quotes" subtitle="Priced proposals, and what happened to them.">
        <BtnLink href="/api/export/crm-quotes" variant="ghost" prefetch={false}>Export CSV</BtnLink>
        <QuoteForm action={createQuote}
          companies={companies.map((c) => ({ id: c.id, label: c.name }))}
          contacts={contacts.map((c) => ({ id: c.id, label: c.full_name }))}
          deals={deals.map((d) => ({ id: d.id, label: d.title }))} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Out with clients" value={money(stats.open)} tone="amber" />
        <Stat label="Accepted" value={money(stats.accepted)} tone="emerald" />
        <Stat label="Quotes raised" value={stats.n} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
        {["", "draft", "sent", "accepted", "declined", "expired"].map((s) => (
          <Link key={s || "all"} href={s ? `/quotes?status=${s}` : "/quotes"}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${status === s ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"}`}>
            {s || "All"}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No quotes yet" hint="Build one from an opportunity and send it to the client." /></Card>
      ) : (
        <Table head={["Reference", "Quote", "Client", "Issued", "Valid until", "Total", "Status"]}>
          {rows.map((q) => (
            <tr key={q.id} className="hover:bg-canvas">
              <Td><Link href={`/quotes/${q.id}`} className="font-bold text-brand-700 hover:underline">{q.ref}</Link></Td>
              <Td className="max-w-xs truncate">{q.title}</Td>
              <Td>{q.company ?? "—"}</Td>
              <Td>{fmtDate(q.issue_date)}</Td>
              <Td>{fmtDate(q.valid_until)}</Td>
              <Td className="tabular font-bold">{money(q.total, q.currency)}</Td>
              <Td><Badge value={q.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
