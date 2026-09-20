import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { getOrg, getSigningSettings } from "@/lib/settings";
import { prettySize } from "@/lib/attachments";
import { decideRequestApproval, saveRequestApprovalSignaturePlacement } from "@/lib/actions/requests";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Field } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { WorkflowSignaturePanel } from "@/components/workflow-signature-panel";

export const metadata = { title: "Request approval document" };

/**
 * The printable approval record for a workflow request.  It is intentionally a
 * portal document rather than an attempted rewrite of an uploaded PDF/Word
 * file: the original reference file remains downloadable, while this document
 * records exactly who approved which request, against immutable signatures.
 */
export default async function RequestApprovalDocument({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [request] = await sql<{
    id: number; ref: string; title: string; description: string | null; category: string; priority: string;
    status: string; due_date: string | null; created_at: string; completed_at: string | null; resolution: string | null;
    requester_id: number; assignee_id: number | null; department_id: number | null;
    requester: string; requester_title: string | null; assignee: string | null; department: string | null;
  }>`
    select r.*, requester.full_name as requester, requester.job_title as requester_title,
           assignee.full_name as assignee, d.name as department
      from workflow_requests r
      join users requester on requester.id = r.requester_id
      left join users assignee on assignee.id = r.assignee_id
      left join departments d on d.id = r.department_id
     where r.id = ${id}`;
  if (!request) notFound();

  const [steps, files, org, settings] = await Promise.all([
    sql<{
      id: number; step: number; user_id: number; name: string; title: string | null; is_final: boolean; status: string;
      note: string | null; decided_at: string | null; signature_ref: string | null; signature_sha256: string | null;
      signature_placement: { x?: number; y?: number } | null;
    }>`
      select s.id, s.step, s.user_id, u.full_name as name, u.job_title as title, s.is_final, s.status,
             s.note, s.decided_at, s.signature_ref, s.signature_sha256, s.signature_placement
        from workflow_request_approval_steps s join users u on u.id = s.user_id
       where s.request_id = ${id} order by s.step`,
    sql<{ id: number; name: string; size_bytes: number; mime: string }>`
      select distinct a.id, a.name, a.size_bytes, a.mime
        from workflow_comments c join attachments a on a.id = c.attachment_id
       where c.request_id = ${id} order by a.name`,
    getOrg(),
    getSigningSettings(),
  ]);

  const isApprover = steps.some((step) => step.user_id === me.id);
  const inQueue = request.assignee_id === null && request.department_id !== null && request.department_id === me.department_id;
  const mayView = request.requester_id === me.id || request.assignee_id === me.id || inQueue || isApprover || can(me, "request.view_all");
  if (!mayView) notFound();

  const mine = steps.find((step) => step.user_id === me.id && step.status === "pending") ?? null;
  const maySign = !!mine && steps.filter((step) => step.step < mine.step).every((step) => step.status === "approved");
  const current = maySign && mine
    ? { id: mine.id, name: mine.name, title: mine.title, signature: me.signature, placement: mine.signature_placement, final: mine.is_final }
    : null;
  const signed = steps
    .filter((step): step is typeof step & { signature_ref: string } => step.status === "approved" && !!step.signature_ref)
    .map((step) => ({ id: step.id, name: step.name, title: step.title, signature: step.signature_ref, placement: step.signature_placement, final: step.is_final }));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/requests/${id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
          ← Back to request
        </Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/export/request/${id}`} className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-bold text-ink-soft hover:bg-canvas">
            Download audit CSV
          </a>
          <PrintButton label="Download / export PDF" />
        </div>
      </div>

      <article className="card mx-auto max-w-3xl p-8 leading-relaxed print:border-0 print:shadow-none sm:p-12">
        <header className="border-b-2 border-ink pb-4">
          <p className="text-xl font-bold">{org.name}</p>
          {org.address && <p className="text-xs font-medium text-ink-soft">{org.address}</p>}
          {(org.phone || org.email) && <p className="text-xs font-medium text-ink-soft">{[org.phone, org.email].filter(Boolean).join(" · ")}</p>}
        </header>

        <h1 className="mt-6 text-center text-sm font-bold tracking-[0.2em] uppercase">Workflow request approval</h1>
        <dl className="mt-6 space-y-1.5 border-y border-line py-4 text-sm">
          {[
            ["Reference", request.ref], ["Date", fmtDate(request.created_at)], ["Requested by", request.requester],
            ["To", request.assignee ?? `${request.department ?? "Department"} queue`], ["Category", titleCase(request.category)],
            ["Priority", titleCase(request.priority)], ...(request.due_date ? [["Needed by", fmtDate(request.due_date)]] : []),
          ].map(([label, value]) => <div key={label} className="flex gap-3"><dt className="w-28 shrink-0 text-[11px] font-bold tracking-wider text-ink-soft uppercase">{label}</dt><dd className="flex-1 font-semibold">{value}</dd></div>)}
        </dl>

        <h2 className="mt-7 text-lg font-bold">{request.title}</h2>
        <div className="mt-3 whitespace-pre-wrap text-[15px] font-medium">{request.description || "No further details were provided."}</div>

        {files.length > 0 && (
          <section className="mt-7 border-t border-line pt-4 print:hidden">
            <h2 className="text-xs font-bold tracking-wider text-ink-soft uppercase">Reference documents</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((file) => (
                <a key={file.id} href={`/api/files/${file.id}?download=1`} className="rounded-xl bg-canvas px-3 py-2 text-sm font-bold text-ink-soft hover:bg-brand-50">
                  Download {file.name} <span className="text-xs font-medium">({prettySize(file.size_bytes)})</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {steps.length === 0 ? (
          <p className="mt-10 border-t border-line pt-4 text-sm font-medium text-ink-soft">This request has no formal approval trail. Its work status is recorded on the request page.</p>
        ) : (
          <>
            <WorkflowSignaturePanel requestId={id} signed={signed} current={current} action={saveRequestApprovalSignaturePlacement} />
            <section className="mt-5 border-t border-line pt-4">
              <h2 className="text-xs font-bold tracking-wider text-ink-soft uppercase">Approval record</h2>
              <ol className="mt-3 space-y-3">
                {steps.map((step) => (
                  <li key={step.id} className="flex gap-3 text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold">{step.step}</span>
                    <span className="min-w-0 flex-1"><strong>{step.name}{step.is_final ? " · final sign-off" : ""}</strong><span className="ml-2 text-ink-soft">{titleCase(step.status)}</span>{step.note && <span className="block text-xs font-medium text-ink-soft">{step.note}</span>}{step.decided_at && <span className="block text-[11px] font-medium text-ink-soft">{fmtDateTime(step.decided_at)}</span>}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        {current && (
          <section className="mt-6 rounded-xl bg-brand-50 p-4 print:hidden">
            <h2 className="text-sm font-bold text-brand-900">Your approval step{current.final ? " — final sign-off" : ""}</h2>
            <ActionForm action={decideRequestApproval} className="mt-3 grid gap-3">
              <input type="hidden" name="id" value={id} />
              <Field label="Note" hint="Optional when approving. Required when rejecting.">
                <textarea name="note" rows={3} className="field !bg-surface" placeholder="Add a note to this decision…" />
              </Field>
              {settings.require_password && current.signature && (
                <Field label="Confirm your password to sign"><input name="password" type="password" autoComplete="current-password" className="field !bg-surface" /></Field>
              )}
              <div className="flex flex-wrap gap-2">
                {current.signature ? <SubmitBtn name="decision" value="approved" variant="success">Approve & sign</SubmitBtn> : <a href="/settings/signature" className="rounded-xl bg-surface px-3.5 py-2 text-sm font-bold text-brand-800 ring-1 ring-brand-200 ring-inset">Add signature to approve</a>}
                <SubmitBtn name="decision" value="rejected" variant="outline">Reject</SubmitBtn>
              </div>
            </ActionForm>
          </section>
        )}

        {request.resolution && <p className="mt-8 border-t border-line pt-4 text-sm"><strong>{request.status === "rejected" ? "Rejection:" : "Decision:"}</strong> {request.resolution}</p>}
        <footer className="mt-10 border-t border-line pt-4 text-[10px] font-medium text-ink-soft">{org.name} — signed workflow approval record. Generated {fmtDateTime(new Date())} by {me.full_name}.</footer>
      </article>
    </>
  );
}
