import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, timeAgo, titleCase } from "@/lib/format";
import { prettySize } from "@/lib/attachments";
import {
  addRequestComment,
  claimRequest,
  decideRequest,
  reassignRequest,
  releaseRequest,
  setRequestStatus,
} from "@/lib/actions/requests";
import { ActionForm, ConfirmBtn, Dialog, Select, SubmitBtn } from "@/components/form";
import { Avatar, Badge, BtnLink, Card, CardTitle, Field, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string; title: string }>`select ref, title from workflow_requests where id = ${Number(id)}`;
  return { title: r ? `${r.ref} — ${r.title}` : "Not found" };
}

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [r] = await sql<{
    id: number; ref: string; title: string; description: string | null; category: string; priority: string;
    status: string; due_date: string | null; created_at: string; completed_at: string | null;
    requester_id: number; assignee_id: number | null; department_id: number | null;
    on_behalf_of: string | null; resolution: string | null; claimed_at: string | null;
    requester: string; requester_title: string | null; requester_avatar: string | null;
    assignee: string | null; assignee_title: string | null; assignee_avatar: string | null;
    department: string | null; decided_by_name: string | null;
  }>`
    select r.*, req.full_name as requester, req.job_title as requester_title, req.avatar_url as requester_avatar,
           asg.full_name as assignee, asg.job_title as assignee_title, asg.avatar_url as assignee_avatar,
           d.name as department, dec.full_name as decided_by_name
      from workflow_requests r
      join users req on req.id = r.requester_id
      left join users asg on asg.id = r.assignee_id
      left join users dec on dec.id = r.decided_by
      left join departments d on d.id = r.department_id
     where r.id = ${id}`;
  if (!r) notFound();

  const isAssignee = r.assignee_id === me.id;
  const isRequester = r.requester_id === me.id;
  // An unclaimed request belongs to a department, and everyone in it may see
  // and pick it up — otherwise a queue nobody can open is not a queue.
  const inQueue = r.assignee_id === null && r.department_id !== null && r.department_id === me.department_id;
  const privileged = can(me, "request.view_all");
  const handler = isAssignee || inQueue || can(me, "request.override");
  const [myApproval] = await sql<{ id: number }>`
    select id from workflow_request_approval_steps where request_id = ${id} and user_id = ${me.id} limit 1`;
  // An approval step is a deliberate invitation to see the request. Without
  // this, an approver outside the target department would receive a notification
  // then land on a 404 and be unable to sign.
  if (!isAssignee && !isRequester && !inQueue && !privileged && !myApproval) notFound();

  const [comments, people, approvalSteps, categories] = await Promise.all([
    sql<{ id: number; body: string; created_at: string; author: string; avatar_url: string | null; file_id: number | null; file_name: string | null; file_size: number | null }>`
      select c.id, c.body, c.created_at, u.full_name as author, u.avatar_url,
             a.id as file_id, a.name as file_name, a.size_bytes as file_size
        from workflow_comments c
        join users u on u.id = c.user_id
        left join attachments a on a.id = c.attachment_id
       where c.request_id = ${id}
       order by c.created_at`,
    sql<{ id: number; full_name: string }>`
      select id, full_name from users
       where status = 'active' and id <> ${r.assignee_id ?? 0} and id <> ${r.requester_id}
       order by full_name`,
    sql<{ id:number; step:number; user_id:number; name:string; is_final:boolean; status:string; note:string|null; decided_at:string|null }>`
      select s.id,s.step,s.user_id,u.full_name as name,s.is_final,s.status,s.note,s.decided_at from workflow_request_approval_steps s join users u on u.id=s.user_id where s.request_id=${id} order by s.step`,
    sql<{category:string}>`select category from workflow_request_categories where request_id=${id} order by category`,
  ]);

  const open = ["pending", "in_progress", "awaiting_info"].includes(r.status);
  const overdue = r.due_date && new Date(r.due_date) < new Date() && open;

  const statusBtn = (status: string, label: string, variant: "primary" | "success" | "danger" | "outline") => (
    <ActionForm action={setRequestStatus} key={status}>
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="status" value={status} />
      <SubmitBtn variant={variant}>{label}</SubmitBtn>
    </ActionForm>
  );

  return (
    <>
      <Link href="/requests" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
        ← Back to requests
      </Link>

      <PageHeader
        title={r.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge value={r.status} />
            {r.priority !== "normal" && <Badge value={r.priority} />}
            {overdue && <Badge value="overdue" label="Overdue" />}
            <span>
              {r.ref} · {(categories.length ? categories.map(c=>titleCase(c.category)).join(", ") : titleCase(r.category))} · raised {timeAgo(r.created_at)}
            </span>
          </span>
        }
      >
        <BtnLink href={`/requests/${r.id}/document`} variant="outline">
          Review document
        </BtnLink>
        {open && inQueue && (
          <ActionForm action={claimRequest}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitBtn>Claim this</SubmitBtn>
          </ActionForm>
        )}
        {open && handler && !isRequester && (
          <>
            {r.status === "pending" && !inQueue && statusBtn("in_progress", "Start work", "primary")}
            {r.status !== "awaiting_info" && statusBtn("awaiting_info", "Need more info", "outline")}
            {approvalSteps.length === 0 && <>
            {/*
              Approve and Reject are one act with a reason, which is what a
              request for a document or a sign-off actually needs. "Mark
              complete" stays for the work that is done rather than decided.
            */}
            <Dialog label="Approve" variant="success" title={`Approve ${r.ref}`} description={r.title}>
              <ActionForm action={decideRequest} className="space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="approved" />
                <Field label="Note" hint="Optional. Sent to the requester.">
                  <textarea name="note" rows={3} className="field resize-y" placeholder="e.g. Approved — the signed copy is attached above." />
                </Field>
                <SubmitBtn variant="success" className="w-full">Approve request</SubmitBtn>
              </ActionForm>
            </Dialog>
            <Dialog label="Reject" variant="danger" title={`Reject ${r.ref}`} description={r.title}>
              <ActionForm action={decideRequest} className="space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="rejected" />
                <Field label="Reason" hint="Required. Sent to the requester.">
                  <textarea name="note" rows={3} required className="field resize-y" placeholder="e.g. This needs the department head's sign-off first." />
                </Field>
                <SubmitBtn variant="danger" className="w-full">Reject request</SubmitBtn>
              </ActionForm>
            </Dialog>
            {statusBtn("completed", "Mark complete", "outline")}
            </>}
          </>
        )}
        {open && isAssignee && r.department_id && (
          <ActionForm action={releaseRequest}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitBtn variant="ghost">Put back in the queue</SubmitBtn>
          </ActionForm>
        )}
        {open && (isRequester || can(me, "request.override")) && (
          <ActionForm action={setRequestStatus}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value="cancelled" />
            <ConfirmBtn
              variant="outline"
              title={`Cancel ${r.ref}?`}
              body={`"${r.title}" disappears from ${r.assignee ?? `the ${r.department ?? "assigned"} queue`} and cannot be reopened. You would need to raise it again.`}
              confirmLabel="Cancel request"
            >
              Cancel
            </ConfirmBtn>
          </ActionForm>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <Avatar name={r.requester} src={r.requester_avatar} size="lg" />
              <div>
                <p className="text-sm font-bold">{r.requester}</p>
                <p className="text-xs font-medium text-ink-soft">
                  {r.requester_title ?? "Staff"} · {fmtDateTime(r.created_at)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed font-medium whitespace-pre-wrap">
              {r.description || "No further details were provided."}
            </p>
          </Card>

          <Card>
            <CardTitle>Activity &amp; documents</CardTitle>
            {comments.length === 0 ? (
              <p className="pb-4 text-sm font-medium text-ink-soft">No updates yet.</p>
            ) : (
              <ul className="space-y-4">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <Avatar name={c.author} src={c.avatar_url} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">
                        {c.author} <span className="ml-1 text-xs font-medium text-ink-soft">{timeAgo(c.created_at)}</span>
                      </p>
                      {c.body && <p className="mt-0.5 text-sm font-medium whitespace-pre-wrap">{c.body}</p>}
                      {c.file_id && (
                        <a
                          href={`/api/files/${c.file_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-2.5 rounded-xl bg-canvas p-2.5 pr-4 hover:bg-brand-50"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-brand-700 ring-1 ring-line ring-inset">
                            <Icon name="clip" />
                          </span>
                          <span>
                            <span className="block text-xs font-bold">{c.file_name}</span>
                            <span className="block text-[11px] font-medium text-ink-soft">{prettySize(c.file_size ?? 0)}</span>
                          </span>
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {(handler || isRequester) && (
              <ActionForm action={addRequestComment} reset className="mt-5 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={r.id} />
                <textarea
                  name="body"
                  rows={3}
                  placeholder={isAssignee ? "Reply, or attach the document requested…" : "Add a note or clarification…"}
                  className="field resize-y"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    name="attachment"
                    className="field flex-1 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700"
                  />
                  <SubmitBtn>
                    <Icon name="send" /> Send
                  </SubmitBtn>
                </div>
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {approvalSteps.length > 0 && <Card><CardTitle>Approval trail</CardTitle><ol className="space-y-3">{approvalSteps.map(s => <li key={s.id} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-canvas text-xs font-bold">{s.step}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{s.name}{s.is_final && " · final sign-off"}</span>{s.note && <span className="block text-xs text-ink-soft">{s.note}</span>}</span><Badge value={s.status}/></li>)}</ol>{approvalSteps.find(s=>s.user_id===me.id && s.status==='pending') && open && <div className="mt-4 border-t border-line pt-4"><BtnLink href={`/requests/${r.id}/document`} variant="success">Review & sign document</BtnLink></div>}</Card>}
          <Card>
            <CardTitle>Routing</CardTitle>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={r.requester} src={r.requester_avatar} size="md" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">Requested by</p>
                  <p className="truncate text-sm font-bold">{r.requester}</p>
                  <p className="truncate text-xs font-medium text-ink-soft">{r.requester_title ?? "Staff"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Avatar name={r.assignee ?? (r.department ?? "Queue")} src={r.assignee_avatar} size="md" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">
                    {r.assignee ? "Assigned to" : "Waiting in"}
                  </p>
                  <p className="truncate text-sm font-bold">{r.assignee ?? `${r.department} queue`}</p>
                  <p className="truncate text-xs font-medium text-ink-soft">
                    {r.assignee ? (r.assignee_title ?? "Staff") : "Unclaimed — anyone in the department can pick it up"}
                  </p>
                </div>
              </div>

              {r.on_behalf_of && (
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">On behalf of</p>
                  <p className="text-sm font-bold">{r.on_behalf_of}</p>
                </div>
              )}

              {r.resolution && (
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">
                    {r.status === "rejected" ? "Reason for rejection" : "Decision"}
                  </p>
                  <p className="text-sm font-medium">{r.resolution}</p>
                  {r.decided_by_name && (
                    <p className="mt-0.5 text-[11px] font-semibold text-ink-soft">{r.decided_by_name}</p>
                  )}
                </div>
              )}
            </div>

            {open && (handler || isRequester) && (
              <Dialog label="Reassign" variant="outline" className="mt-4 w-full" title="Reassign request" description="The new assignee is notified.">
                <ActionForm action={reassignRequest} className="space-y-4">
                  <input type="hidden" name="id" value={r.id} />
                  <Field label="New assignee">
                    <Select name="assignee_id" required className="field" defaultValue="">
                      <option value="">Choose…</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitBtn className="w-full">Reassign</SubmitBtn>
                </ActionForm>
              </Dialog>
            )}
          </Card>

          <Card>
            <CardTitle>Details</CardTitle>
            <dl className="space-y-3 text-sm">
              {[
                ["Reference", r.ref],
                ["Category", titleCase(r.category)],
                ["Priority", titleCase(r.priority)],
                ["Needed by", fmtDate(r.due_date)],
                ["Status", titleCase(r.status)],
                ["Completed", r.completed_at ? fmtDateTime(r.completed_at) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="font-medium text-ink-soft">{k}</dt>
                  <dd className="text-right font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
