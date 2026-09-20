import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { prettySize } from "@/lib/attachments";
import { cancelLeave, decideLeave } from "@/lib/actions/leave";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { Avatar, Badge, Card, CardTitle, Field, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string }>`select ref from leave_requests where id = ${Number(id)}`;
  return { title: r ? `Leave ${r.ref}` : "Not found" };
}

export default async function LeaveDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [r] = await sql<{
    id: number; ref: string; status: string; days: string; start_date: string; end_date: string;
    reason: string | null; decision_note: string | null; decided_at: string | null; created_at: string;
    user_id: number; staff: string; staff_title: string | null; avatar_url: string | null; department: string | null;
    manager_id: number | null; type: string; approver: string | null; handover: string | null;
    file_id: number | null; file_name: string | null; file_size: number | null;
  }>`
    select lr.id, lr.ref, lr.status, lr.days, lr.start_date, lr.end_date, lr.reason, lr.decision_note,
           lr.decided_at, lr.created_at, lr.user_id,
           u.full_name as staff, u.job_title as staff_title, u.avatar_url, u.manager_id,
           d.name as department, lt.name as type,
           a.full_name as approver, h.full_name as handover,
           f.id as file_id, f.name as file_name, f.size_bytes as file_size
      from leave_requests lr
      join users u on u.id = lr.user_id
      join leave_types lt on lt.id = lr.leave_type_id
      left join departments d on d.id = u.department_id
      left join users a on a.id = lr.approver_id
      left join users h on h.id = lr.handover_to
      left join attachments f on f.id = lr.attachment_id
     where lr.id = ${id}`;
  if (!r) notFound();

  const isMine = r.user_id === me.id;
  const canDecide = r.status === "pending" && (can(me, "leave.approve_any") || r.manager_id === me.id) && !isMine;
  const canCancel = ["pending", "approved"].includes(r.status) && (isMine || can(me, "leave.approve_any"));
  if (!isMine && !can(me, "leave.approve_any") && r.manager_id !== me.id) notFound();

  return (
    <>
      <Link href={isMine ? "/leave" : "/leave/approvals"} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
        ← Back
      </Link>

      <PageHeader title={`Leave request ${r.ref}`} subtitle={<Badge value={r.status} />}>
        {canCancel && (
          <Dialog label="Cancel request" variant="outline" title={`Cancel ${r.ref}`} description="This cannot be undone.">
            <ActionForm action={cancelLeave} className="space-y-4">
              <input type="hidden" name="id" value={r.id} />
              <p className="text-sm font-medium text-ink-soft">
                Cancelling returns {Number(r.days)} day(s) to the entitlement if the request was already approved.
              </p>
              <SubmitBtn variant="danger" className="w-full">
                Yes, cancel it
              </SubmitBtn>
            </ActionForm>
          </Dialog>
        )}
        {canDecide && (
          <>
            <Dialog label="Reject" variant="outline" title={`Reject ${r.ref}`}>
              <ActionForm action={decideLeave} className="space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="rejected" />
                <Field label="Reason for rejection">
                  <textarea name="note" rows={4} required className="field resize-y" />
                </Field>
                <SubmitBtn variant="danger" className="w-full">
                  Reject request
                </SubmitBtn>
              </ActionForm>
            </Dialog>
            <Dialog label="Approve" variant="success" title={`Approve ${r.ref}`}>
              <ActionForm action={decideLeave} className="space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="approved" />
                <Field label="Note" hint="Optional.">
                  <textarea name="note" rows={3} className="field resize-y" />
                </Field>
                <SubmitBtn variant="success" className="w-full">
                  Approve request
                </SubmitBtn>
              </ActionForm>
            </Dialog>
          </>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <Avatar name={r.staff} src={r.avatar_url} size="lg" />
            <div>
              <p className="font-bold">{r.staff}</p>
              <p className="text-xs font-medium text-ink-soft">
                {r.staff_title ?? "Staff"} · {r.department ?? "No department"}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-bold tabular">{Number(r.days)}</p>
              <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">Working days</p>
            </div>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Leave type", r.type],
              ["First day", fmtDate(r.start_date)],
              ["Last day", fmtDate(r.end_date)],
              ["Applied", `${fmtDate(r.created_at)} (${timeAgo(r.created_at)})`],
              ["Handover to", r.handover ?? "Nobody named"],
              ["Approver", r.approver ?? "Awaiting routing"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">{k}</dt>
                <dd className="mt-0.5 text-sm font-bold">{v}</dd>
              </div>
            ))}
          </dl>

          {r.reason && (
            <div className="mt-5">
              <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Reason</p>
              <p className="mt-1 rounded-xl bg-canvas p-3 text-sm font-medium whitespace-pre-wrap">{r.reason}</p>
            </div>
          )}

          {r.file_id && (
            <a
              href={`/api/files/${r.file_id}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex items-center gap-3 rounded-xl bg-canvas p-3 hover:bg-brand-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-brand-700 ring-1 ring-line ring-inset">
                <Icon name="clip" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{r.file_name}</span>
                <span className="block text-xs font-medium text-ink-soft">{prettySize(r.file_size ?? 0)}</span>
              </span>
            </a>
          )}
        </Card>

        <Card>
          <CardTitle>Decision</CardTitle>
          {r.status === "pending" ? (
            <p className="text-sm font-medium text-ink-soft">
              Waiting on {r.approver ?? "an approver"}. You will be notified in the portal and by email.
            </p>
          ) : (
            <>
              <Badge value={r.status} />
              <p className="mt-3 text-sm font-semibold">
                {r.approver ?? "System"} · {fmtDateTime(r.decided_at)}
              </p>
              {r.decision_note && (
                <p className="mt-2 rounded-xl bg-canvas p-3 text-sm font-medium whitespace-pre-wrap">{r.decision_note}</p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
