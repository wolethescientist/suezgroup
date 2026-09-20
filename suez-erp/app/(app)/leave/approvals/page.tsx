import Link from "next/link";
import { redirect } from "next/navigation";
import { can, canApproveLeave, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, timeAgo } from "@/lib/format";
import { decideLeave } from "@/lib/actions/leave";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { Avatar, Badge, Card, Empty, Field, PageHeader } from "@/components/ui";

export const metadata = { title: "Leave approvals" };

export default async function ApprovalsPage() {
  const me = await requireUser();
  if (!canApproveLeave(me)) redirect("/leave");
  const wide = can(me, "leave.approve_any");
  // Only an executive may see — let alone decide — the leave of someone who
  // approves everyone else's. Filtering it out of the list is what stops two
  // colleagues in HR quietly approving each other's.
  const executive = can(me, "leave.approve_executive");

  const rows = await sql<{
    id: number; ref: string; staff: string; staff_id: number; avatar_url: string | null; department: string | null;
    type: string; start_date: string; end_date: string; days: string; reason: string | null; created_at: string;
    remaining: string; handover: string | null; escalated: boolean;
  }>`
    select lr.id, lr.ref, u.full_name as staff, u.id as staff_id, u.avatar_url, d.name as department,
           lt.name as type, lr.start_date, lr.end_date, lr.days, lr.reason, lr.created_at,
           h.full_name as handover,
           coalesce(lb.entitled, lt.default_days) - coalesce(lb.used, 0) as remaining,
           exists (select 1 from role_permissions rp
                    where rp.role_key = u.role and rp.capability = 'leave.approve_any') as escalated
      from leave_requests lr
      join users u on u.id = lr.user_id
      join leave_types lt on lt.id = lr.leave_type_id
      left join departments d on d.id = u.department_id
      left join users h on h.id = lr.handover_to
      left join leave_balances lb on lb.user_id = u.id and lb.leave_type_id = lt.id and lb.year = extract(year from lr.start_date)
     where lr.status = 'pending'
       and lr.user_id <> ${me.id}
       and (${wide} or ${executive} or u.manager_id = ${me.id})
       and (${executive}
            or not exists (select 1 from role_permissions rp
                            where rp.role_key = u.role and rp.capability = 'leave.approve_any'))
     order by lr.created_at`;

  return (
    <>
      <PageHeader
        title="Leave approvals"
        subtitle={
          executive
            ? "Every pending request, including the leave of the people who approve everyone else's."
            : wide
              ? "Every pending request across the company. An approver's own leave goes to an executive."
              : "Requests from your direct reports."
        }
      >
        <Link href="/leave" className="rounded-xl px-3 py-2 text-xs font-bold text-ink-soft hover:bg-canvas hover:text-ink">← My leave</Link>
      </PageHeader>

      {rows.length === 0 ? (
        <Card>
          <Empty title="Nothing to approve" hint="Pending requests from your team appear here." />
        </Card>
      ) : (
        <ul className="grid gap-4">
          {rows.map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start gap-4">
                <Avatar name={r.staff} src={r.avatar_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{r.staff}</p>
                    <Badge value="pending" />
                    {r.escalated && <Badge value="high" label="Approver's own leave" />}
                    <span className="text-xs font-semibold text-ink-soft">
                      {r.ref} · applied {timeAgo(r.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    {r.type} · {Number(r.days)} working day{Number(r.days) === 1 ? "" : "s"} ·{" "}
                    {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-ink-soft">
                    {r.department ?? "No department"} · {Number(r.remaining)} day(s) entitlement left
                    {r.handover ? ` · handover to ${r.handover}` : " · no handover named"}
                  </p>
                  {r.reason && <p className="mt-2 rounded-xl bg-canvas p-3 text-sm font-medium">{r.reason}</p>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link href={`/leave/${r.id}`} className="text-xs font-bold text-brand-700 hover:underline">
                    Details
                  </Link>
                  <Dialog label="Reject" variant="outline" title={`Reject ${r.ref}`} description={`${r.staff} · ${r.type}`}>
                    <ActionForm action={decideLeave} className="space-y-4">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <Field label="Reason for rejection" hint="Shared with the employee.">
                        <textarea name="note" rows={4} required className="field resize-y" placeholder="e.g. Insufficient cover during that period." />
                      </Field>
                      <SubmitBtn variant="danger" className="w-full">
                        Reject request
                      </SubmitBtn>
                    </ActionForm>
                  </Dialog>
                  <Dialog label="Approve" variant="success" title={`Approve ${r.ref}`} description={`${Number(r.days)} day(s) will be deducted`}>
                    <ActionForm action={decideLeave} className="space-y-4">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Field label="Note" hint="Optional.">
                        <textarea name="note" rows={3} className="field resize-y" placeholder="e.g. Approved — enjoy your break." />
                      </Field>
                      <SubmitBtn variant="success" className="w-full">
                        Approve request
                      </SubmitBtn>
                    </ActionForm>
                  </Dialog>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
