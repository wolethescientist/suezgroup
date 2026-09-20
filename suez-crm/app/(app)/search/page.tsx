import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { compactMoney, titleCase } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const like = `%${q}%`;

  if (!q)
    return (
      <>
        <PageHeader title="Search" subtitle="Companies, contacts, opportunities, leads, quotes and tickets." />
        <Card><Empty title="Type something" hint="Use the search box in the header, or add ?q= to the URL." /></Card>
      </>
    );

  const [companies, contacts, deals, leads, tickets, quotes] = await Promise.all([
    sql<{ id: number; name: string; industry: string | null; status: string }>`
      select id, name, industry, status from crm_companies
       where name ilike ${like} or industry ilike ${like} or email ilike ${like}
       order by name limit 8`,
    sql<{ id: number; full_name: string; company: string | null; company_id: number | null }>`
      select ct.id, ct.full_name, c.name as company, c.id as company_id
        from crm_contacts ct left join crm_companies c on c.id = ct.company_id
       where ct.full_name ilike ${like} or ct.email ilike ${like}
       order by ct.full_name limit 8`,
    sql<{ id: number; title: string; value: string; currency: string; stage: string }>`
      select id, title, value, currency, stage from crm_deals
       where title ilike ${like} or notes ilike ${like}
       order by value desc limit 8`,
    sql<{ id: number; full_name: string; company_name: string | null; status: string; score: number }>`
      select id, full_name, company_name, status, score from crm_leads
       where full_name ilike ${like} or company_name ilike ${like} or email ilike ${like}
       order by score desc limit 8`,
    sql<{ id: number; ref: string; subject: string; status: string }>`
      select id, ref, subject, status from crm_tickets
       where ref ilike ${like} or subject ilike ${like} or body ilike ${like}
       order by created_at desc limit 8`,
    // ponytail: quotes were the one document type search did not cover, so a
    // quote reference returned "0 matches" while the empty state advised
    // searching by reference number.
    sql<{ id: number; ref: string; title: string; status: string; total: string; currency: string; company: string | null }>`
      select q.id, q.ref, q.title, q.status, q.total, q.currency, c.name as company
        from crm_quotes q left join crm_companies c on c.id = q.company_id
       where q.ref ilike ${like} or q.title ilike ${like} or c.name ilike ${like}
       order by q.created_at desc limit 8`,
  ]);

  const total = companies.length + contacts.length + deals.length + leads.length + tickets.length + quotes.length;
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card><h2 className="mb-3 text-xs font-bold tracking-wider text-ink-soft uppercase">{title}</h2><ul className="-mx-1 divide-y divide-line">{children}</ul></Card>
  );
  const row = (href: string, primary: React.ReactNode, secondary: React.ReactNode, trailing?: React.ReactNode) => (
    <li><Link href={href} className="flex items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-canvas">
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{primary}</span><span className="block truncate text-xs font-medium text-ink-soft">{secondary}</span></span>{trailing}
    </Link></li>
  );

  return (
    <>
      <PageHeader title={`Results for “${q}”`} subtitle={`${total} match${total === 1 ? "" : "es"} across SuezCRM.`} />
      <form className="relative mb-5">
        <input name="q" defaultValue={q} className="field pl-9 sm:w-96" placeholder="Search again…" />
        <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
      </form>
      {total === 0 ? <Card><Empty title="No matches" hint="Try a shorter term, reference number or customer name." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {companies.length > 0 && <Section title="Companies">{companies.map((company) => row(`/companies/${company.id}`, company.name, company.industry ?? "Industry unknown", <Badge value={company.status} />))}</Section>}
          {contacts.length > 0 && <Section title="Contacts">{contacts.map((contact) => row(contact.company_id ? `/companies/${contact.company_id}` : "/contacts", contact.full_name, contact.company ?? "No company"))}</Section>}
          {deals.length > 0 && <Section title="Opportunities">{deals.map((deal) => row(`/deals/${deal.id}`, deal.title, titleCase(deal.stage), <span className="text-sm font-bold tabular">{compactMoney(deal.value, deal.currency)}</span>))}</Section>}
          {leads.length > 0 && <Section title="Leads">{leads.map((lead) => row("/leads", lead.full_name, lead.company_name ?? "No company", <Badge value={lead.status} label={`${lead.score}/100`} />))}</Section>}
          {quotes.length > 0 && <Section title="Quotes">{quotes.map((q) => row(`/quotes/${q.id}`, q.title, `${q.ref}${q.company ? ` · ${q.company}` : ""}`, <span className="text-sm font-bold tabular">{compactMoney(q.total, q.currency)}</span>))}</Section>}
          {tickets.length > 0 && <Section title="Tickets">{tickets.map((ticket) => row(`/tickets/${ticket.id}`, ticket.subject, ticket.ref, <Badge value={ticket.status} />))}</Section>}
        </div>
      )}
    </>
  );
}
