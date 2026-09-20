import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, titleCase } from "@/lib/format";
import { Avatar, Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ExpenseForm } from "@/components/erp-forms";
import { claimExpense } from "@/lib/actions/finance";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const { tab = "mine" } = await searchParams;
  const isFinance = can(me, "expense.approve");

  const rows = await sql<{
    id: number; ref: string; description: string; category: string; amount: string; currency: string;
    spent_on: string; status: string; who: string; who_avatar: string | null; project: string | null;
  }>`
    select e.id, e.ref, e.description, e.category, e.amount, e.currency, e.spent_on, e.status,
           u.full_name as who, u.avatar_url as who_avatar, p.name as project
      from expenses e
      join users u on u.id = e.user_id
      left join projects p on p.id = e.project_id
     where case ${tab}
             when 'mine' then e.user_id = ${me.id}
             when 'pending' then ${isFinance} and e.status = 'pending'
             else ${isFinance}
           end
     order by e.created_at desc limit 200`;

  const [mine] = await sql<{ pending: string; approved: string }>`
    select coalesce(sum(amount) filter (where status = 'pending'), 0) as pending,
           coalesce(sum(amount) filter (where status in ('approved','reimbursed')), 0) as approved
      from expenses where user_id = ${me.id}`;

  const projects = await sql<{ id: number; name: string }>`select id, name from projects where status in ('planning','active') order by name`;

  const TABS = [["mine", "My claims"], ...(isFinance ? [["pending", "Awaiting decision"], ["all", "Everyone"]] : [])] as const;

  return (
    <>
      <PageHeader title="Expenses" subtitle="Claim what you spent on company business and track reimbursement.">
        <BtnLink href="/api/export/expenses" variant="ghost" prefetch={false}>Export CSV</BtnLink>
        <ExpenseForm action={claimExpense} projects={projects.map((p) => ({ id: p.id, label: p.name }))} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label="My claims awaiting decision" value={money(mine.pending)} tone="amber" />
        <Stat label="My claims approved" value={money(mine.approved)} tone="emerald" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/finance/expenses?tab=${key}`}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${tab === key ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"}`}>
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No claims here" hint="Claim an expense and it goes to finance for approval." /></Card>
      ) : (
        <Table head={["Reference", "Description", "Who", "Category", "Spent", "Amount", "Status"]}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <Td><Link href={`/finance/expenses/${r.id}`} className="font-bold text-brand-700 hover:underline">{r.ref}</Link></Td>
              <Td className="max-w-xs truncate">{r.description}{r.project ? <span className="text-ink-soft"> · {r.project}</span> : null}</Td>
              <Td><span className="flex items-center gap-2"><Avatar name={r.who} src={r.who_avatar} size="sm" />{r.who}</span></Td>
              <Td>{titleCase(r.category)}</Td>
              <Td>{fmtDate(r.spent_on)}</Td>
              <Td className="tabular font-bold">{money(r.amount, r.currency)}</Td>
              <Td><Badge value={r.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
