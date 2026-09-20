import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { TicketForm } from "@/components/sales-forms";
import { raiseTicket } from "@/lib/actions/sales";

export const metadata = { title: "Support tickets" };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { status = "open" } = await searchParams;

  const rows = await sql<{
    id: number; ref: string; subject: string; company: string | null; contact: string | null;
    priority: string; status: string; due_at: string | null; created_at: string; first_response_at: string | null;
    assignee: string | null; assignee_avatar: string | null; replies: number;
  }>`
    select t.id, t.ref, t.subject, c.name as company, ct.full_name as contact, t.priority, t.status,
           t.due_at, t.created_at, t.first_response_at, u.full_name as assignee, u.avatar_url as assignee_avatar,
           (select count(*) from crm_ticket_replies r where r.ticket_id = t.id)::int as replies
      from crm_tickets t
      left join crm_companies c on c.id = t.company_id
      left join crm_contacts ct on ct.id = t.contact_id
      left join users u on u.id = t.assignee_id
     where case ${status}
             when 'open' then t.status in ('open','in_progress','waiting_customer')
             when '' then true
             else t.status = ${status}
           end
     order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
              t.due_at nulls last, t.created_at desc
     limit 200`;

  const [stats] = await sql<{ open: number; overdue: number; urgent: number }>`
    select count(*) filter (where status in ('open','in_progress','waiting_customer'))::int as open,
           -- Only tickets nobody has answered yet can be past their RESPONSE target.
           count(*) filter (where status in ('open','in_progress','waiting_customer')
                              and first_response_at is null and due_at < now())::int as overdue,
           count(*) filter (where status in ('open','in_progress','waiting_customer') and priority = 'urgent')::int as urgent
      from crm_tickets`;

  const [companies, contacts, users] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from crm_companies order by name limit 500`,
    sql<{ id: number; full_name: string }>`select id, full_name from crm_contacts order by full_name limit 500`,
    sql<{ id: number; full_name: string }>`select id, full_name from users where status = 'active' order by full_name`,
  ]);

  return (
    <>
      <PageHeader title="Support tickets" subtitle="Client issues, with a response target on every one.">
        <BtnLink href="/api/export/crm-tickets" variant="ghost" prefetch={false}>Export CSV</BtnLink>
        <TicketForm action={raiseTicket}
          companies={companies.map((c) => ({ id: c.id, label: c.name }))}
          contacts={contacts.map((c) => ({ id: c.id, label: c.full_name }))}
          users={users.map((u) => ({ id: u.id, label: u.full_name }))} />
      </PageHeader>
      <Card className="mb-5"><p className="text-sm font-medium text-ink-soft">A ticket is saved in CRM and assigned to a responsible person. They open it, post internal notes or a client-facing reply, update its status, and resolve or close it. Everyone with access can see the current owner, reply history, and response target, so issues such as IT or vending problems do not disappear into private messages.</p></Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Open tickets" value={stats.open} />
        <Stat label="Past their response target" value={stats.overdue} tone={stats.overdue ? "rose" : "emerald"} />
        <Stat label="Urgent" value={stats.urgent} tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
        {[["open", "Open"], ["waiting_customer", "Waiting on client"], ["resolved", "Resolved"], ["closed", "Closed"], ["", "All"]].map(([s, label]) => (
          <Link key={s || "all"} href={`/tickets?status=${s}`}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${status === s ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"}`}>
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No tickets here" hint="Raise one when a client reports a problem." /></Card>
      ) : (
        <Table head={["Reference", "Subject", "Client", "Assigned", "Response due", "Priority", "Status"]}>
          {rows.map((t) => {
            const answered = !!t.first_response_at;
            const overdue = !answered && t.due_at && new Date(t.due_at) < new Date() && !["resolved", "closed"].includes(t.status);
            return (
              <tr key={t.id} className="hover:bg-canvas">
                <Td><Link href={`/tickets/${t.id}`} className="font-bold text-brand-700 hover:underline">{t.ref}</Link></Td>
                <Td className="max-w-xs">
                  <span className="block truncate font-bold">{t.subject}</span>
                  {t.replies > 0 && <span className="text-xs text-ink-soft">{t.replies} repl{t.replies === 1 ? "y" : "ies"}</span>}
                </Td>
                <Td>{t.company ?? "—"}{t.contact && <span className="block text-xs text-ink-soft">{t.contact}</span>}</Td>
                <Td>{t.assignee ? <span className="flex items-center gap-2"><Avatar name={t.assignee} src={t.assignee_avatar} size="sm" />{t.assignee}</span> : "—"}</Td>
                <Td className="text-xs">
                  {answered ? (
                    <span className="text-emerald-700">Answered {timeAgo(t.first_response_at!)}</span>
                  ) : (
                    t.due_at ? timeAgo(t.due_at) : "—"
                  )}
                  {overdue && <Badge value="overdue" label="Overdue" className="ml-1" />}
                </Td>
                <Td><Badge value={t.priority} /></Td>
                <Td><Badge value={t.status} /></Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
