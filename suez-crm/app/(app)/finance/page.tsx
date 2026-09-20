import Link from "next/link";
import { canAny, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { compactMoney } from "@/lib/format";
import { Card, CardTitle, Empty, PageHeader, Stat } from "@/components/ui";

export const metadata={title:"Finance"};
export default async function FinancePage(){
  const me=await requireUser(); if(!canAny(me,"invoice.manage","expense.approve","budget.manage","deposit.view")) return <Card><Empty title="Finance access is restricted" hint="Ask an administrator to grant the relevant finance permission."/></Card>;
  const [totals]=await sql<{receivable:string;expenses:string;budget:string}>`select (select coalesce(sum(total-amount_paid),0) from crm_finance_invoices where status in ('sent','part_paid')) as receivable,(select coalesce(sum(amount),0) from crm_finance_expenses where status in ('approved','reimbursed')) as expenses,(select coalesce(sum(allocated),0) from crm_finance_budgets where fiscal_year=extract(year from current_date)) as budget`;
  return <><PageHeader title="Finance" subtitle="CRM-owned invoices, expenses, budgets, and customer deposits. ERP finance history was intentionally not moved."/>
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><Stat label="Outstanding invoices" value={compactMoney(Number(totals.receivable))} tone="amber"/><Stat label="Approved expenses" value={compactMoney(Number(totals.expenses))} tone="rose"/><Stat label="This year's budgets" value={compactMoney(Number(totals.budget))} tone="sky"/></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[["Invoices","Create invoices and receipt payments.","/finance/invoices"],["Expenses","Submit and approve expense claims.","/finance/expenses"],["Budgets","Set operating and campaign budgets.","/finance/budgets"],["Deposit accounts","Track customer prepayments and drawdowns.","/deposits"]].map(([title,body,href])=><Link key={href} href={href} className="card block p-5 transition hover:border-brand-200 hover:bg-brand-50/30"><CardTitle>{title}</CardTitle><p className="text-sm font-medium text-ink-soft">{body}</p><p className="mt-4 text-xs font-bold text-brand-700">Open →</p></Link>)}</div>
  </>;
}
