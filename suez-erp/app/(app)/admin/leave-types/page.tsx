import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { grantEntitlements } from "@/lib/actions/admin";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { LeaveTypeForm } from "@/components/admin-forms";
import { Badge, Card, CardTitle, Field, PageHeader, Table, Td } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Leave policy" };

export default async function LeaveTypesAdmin() {
  await requireCap("people.leave_policy");
  const year = new Date().getFullYear();

  const rows = await sql<{ id: number; name: string; default_days: number; color: string; paid: boolean; granted: number; taken: string; pending: number }>`
    select lt.id, lt.name, lt.default_days, lt.color, lt.paid,
           (select count(*) from leave_balances lb where lb.leave_type_id = lt.id and lb.year = ${year})::int as granted,
           (select coalesce(sum(used),0) from leave_balances lb where lb.leave_type_id = lt.id and lb.year = ${year}) as taken,
           (select count(*) from leave_requests lr where lr.leave_type_id = lt.id and lr.status = 'pending')::int as pending
      from leave_types lt
     order by lt.name`;

  return (
    <>
      <PageHeader title="Leave policy" subtitle="Leave types, annual entitlements and how they are applied to staff.">
        <Dialog label="Grant entitlements" variant="outline" title={`Apply entitlements for ${year}`}>
          <ActionForm action={grantEntitlements} className="space-y-4">
            <p className="text-sm font-medium text-ink-soft">
              Sets every active employee's entitlement to the default days for each leave type. Days already taken are
              preserved.
            </p>
            <Field label="Year">
              <input name="year" type="number" defaultValue={year} min="2020" max="2100" className="field tabular" />
            </Field>
            <SubmitBtn className="w-full">Apply to all staff</SubmitBtn>
          </ActionForm>
        </Dialog>
        <Dialog label={<><Icon name="plus" /> Add leave type</>} title="Add leave type">
          <LeaveTypeForm />
        </Dialog>
      </PageHeader>

      <Table head={["Leave type", "Days / year", "Paid", `Staff granted (${year})`, "Days taken", "Pending", ""]}>
        {rows.map((t) => (
          <tr key={t.id} className="hover:bg-canvas">
            <Td>
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                <span className="font-bold">{t.name}</span>
              </div>
            </Td>
            <Td className="tabular">{t.default_days}</Td>
            <Td>
              <Badge value={t.paid ? "paid" : "low"} label={t.paid ? "Paid" : "Unpaid"} />
            </Td>
            <Td className="tabular">{t.granted}</Td>
            <Td className="tabular">{Number(t.taken)}</Td>
            <Td className="tabular">{t.pending}</Td>
            <Td className="text-right">
              <Dialog label="Edit" variant="ghost" className="!px-2 !py-1 !text-xs !text-brand-700" title={`Edit ${t.name}`}>
                <LeaveTypeForm record={t} />
              </Dialog>
            </Td>
          </tr>
        ))}
      </Table>

      <Card className="mt-6">
        <CardTitle>How leave is routed</CardTitle>
        <ol className="space-y-2 text-sm font-medium text-ink-soft">
          {[
            "An employee applies; working days are calculated automatically and checked against their remaining entitlement.",
            "The request goes to their line manager. Employees with no manager route to the head of Human Resources.",
            "On approval the days are deducted from the balance; cancelling an approved request returns them.",
            "Administrators and HR can approve on behalf of any manager, and can override any entitlement.",
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
