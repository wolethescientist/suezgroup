import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { money } from "@/lib/format";
import { Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn } from "@/components/form";
import { BudgetForm } from "@/components/erp-forms";
import { deleteBudget, saveBudget } from "@/lib/actions/finance";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  await requireCap("budget.manage");
  const year = new Date().getFullYear();

  /**
   * Spend against an allocation, and what is committed but not yet spent.
   *
   * ponytail: two bugs lived in the old version of this query.
   *  - It selected b.category, displayed it, and never filtered on it, so every
   *    allocation in a department showed that department's WHOLE spend. One
   *    NGN 480,000 claim appeared against both Sales allocations at once.
   *  - The comment claimed purchase invoices were included. They were not — only
   *    expenses were summed, so a paid supplier invoice on a project showed the
   *    budget as untouched. For most companies that is the majority of spend.
   * Category matching is opt-in: an allocation with no category is the
   * department's general pot and still catches everything uncategorised.
   */
  const rows = await sql<{
    id: number; fiscal_year: number; category: string | null; allocated: string; currency: string;
    department: string | null; project: string | null; spent: string; committed: string;
  }>`
    select b.id, b.fiscal_year, b.category, b.allocated, b.currency,
           d.name as department, p.name as project,
           coalesce((
             select sum(e.amount) from expenses e
              left join users u on u.id = e.user_id
              where e.status in ('approved','reimbursed')
                and extract(year from e.spent_on) = b.fiscal_year
                and (b.category is null or b.category = '' or lower(e.category) = lower(b.category))
                and ((b.project_id is not null and e.project_id = b.project_id)
                  or (b.project_id is null and b.department_id is not null and u.department_id = b.department_id))
           ), 0)
           + coalesce((
             select sum(i.total) from invoices i
              left join users c on c.id = i.created_by
              where i.kind = 'purchase'
                and i.status <> 'cancelled'
                and extract(year from i.issue_date) = b.fiscal_year
                and ((b.project_id is not null and i.project_id = b.project_id)
                  or (b.project_id is null and b.department_id is not null and i.project_id is null
                      and c.department_id = b.department_id))
           ), 0) as spent,
           coalesce((
             select sum(o.total) from purchase_orders o
              left join purchase_requisitions r on r.id = o.requisition_id
              where o.status in ('sent','part_received','received')
                and not exists (select 1 from invoices i where i.po_id = o.id and i.status <> 'cancelled')
                and extract(year from o.order_date) = b.fiscal_year
                and ((b.project_id is not null and r.project_id = b.project_id)
                  or (b.project_id is null and b.department_id is not null and r.department_id = b.department_id))
           ), 0) as committed
      from budgets b
      left join departments d on d.id = b.department_id
      left join projects p on p.id = b.project_id
     order by b.fiscal_year desc, d.name nulls last, p.name nulls last`;

  const [totals] = await sql<{ allocated: string }>`
    select coalesce(sum(allocated), 0) as allocated from budgets where fiscal_year = ${year}`;

  const [departments, projects] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from departments order by name`,
    sql<{ id: number; name: string }>`select id, name from projects order by name`,
  ]);

  return (
    <>
      <PageHeader title="Budgets" subtitle="Allocations, what has been spent against them, and what is already committed on open orders.">
        <BudgetForm action={saveBudget}
          departments={departments.map((d) => ({ id: d.id, label: d.name }))}
          projects={projects.map((p) => ({ id: p.id, label: p.name }))} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label={`Allocated for ${year}`} value={money(totals.allocated)} />
        <Stat label="Allocations on file" value={rows.length} tone="sky" />
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No budgets set" hint="Allocate to a department or a project. Approved expenses and supplier invoices count against it." /></Card>
      ) : (
        <Table head={["Year", "Against", "Category", "Allocated", "Spent", "Committed", "Remaining", ""]}>
          {rows.map((b) => {
            // Remaining is what is left after money already spent AND money the
            // company has already committed on open purchase orders.
            const remaining = Number(b.allocated) - Number(b.spent) - Number(b.committed);
            const used = Number(b.spent) + Number(b.committed);
            const pct = Number(b.allocated) > 0 ? Math.min(100, (used / Number(b.allocated)) * 100) : 0;
            return (
              <tr key={b.id} className="hover:bg-canvas">
                <Td className="tabular">{b.fiscal_year}</Td>
                <Td className="font-bold">{b.project ?? b.department ?? "Organisation-wide"}</Td>
                <Td>{b.category || <span className="text-ink-soft">All categories</span>}</Td>
                <Td className="tabular">{money(b.allocated, b.currency)}</Td>
                <Td>
                  <span className="tabular">{money(b.spent, b.currency)}</span>
                  <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                    <span className={`block h-full ${pct > 90 ? "bg-rose-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${pct}%` }} />
                  </span>
                </Td>
                <Td className="tabular text-ink-soft">{money(b.committed, b.currency)}</Td>
                <Td className={`tabular font-bold ${remaining < 0 ? "text-rose-700" : ""}`}>{money(remaining, b.currency)}</Td>
                <Td>
                  <ActionForm action={deleteBudget}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmBtn
                      title="Remove this allocation?"
                      body={`${b.project ?? b.department ?? "Organisation-wide"} — ${money(b.allocated, b.currency)} for ${b.fiscal_year}. The allocation is deleted; the spend against it is not.`}
                      confirmLabel="Remove allocation"
                    >
                      Remove
                    </ConfirmBtn>
                  </ActionForm>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
