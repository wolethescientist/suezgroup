import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { prettySize } from "@/lib/attachments";
import { getSigningSettings } from "@/lib/settings";
import { canEditMemo, canViewDelivery, canViewMemo } from "@/lib/memos";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { acknowledgeMemo, archiveMemo, publishMemo, touchMemo } from "@/lib/actions/memos";
import { addAnnotation, cancelRoute, decideRoute, routeDocument } from "@/lib/actions/documents";
import { askVerb, ROUTE_STATUS } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Avatar, Badge, BtnLink, Card, CardTitle, Field, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AnnotatedDocument } from "@/components/annotated-document";
import { RouteDecision, RouteDocument } from "@/components/document-routing";

type Memo = {
  id: number;
  ref: string;
  kind: string;
  title: string;
  body: string;
  body_html: string | null;
  version: number;
  updated_at: string | null;
  priority: string;
  audience: string;
  status: string;
  requires_ack: boolean;
  published_at: string | null;
  created_at: string;
  author_id: number;
  author: string;
  author_title: string | null;
  author_signature: string | null;
  author_signature_ref: string | null;
  author_signature_sha256: string | null;
  department: string | null;
  file_id: number | null;
  file_name: string | null;
  file_size: number | null;
};

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string; title: string }>`select ref, title from memos where id = ${Number(id)}`;
  return { title: r ? `${r.ref} — ${r.title}` : "Not found" };
}

export default async function MemoPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);

  const [memo] = await sql<Memo>`
    select m.*, u.full_name as author, u.job_title as author_title, u.signature as author_signature,
           d.name as department, a.id as file_id, a.name as file_name, a.size_bytes as file_size
      from memos m
      join users u on u.id = m.author_id
      left join departments d on d.id = m.department_id
      left join attachments a on a.id = m.attachment_id
     where m.id = ${id}`;
  if (!memo) notFound();

  const [mine] = await sql<{
    read_at: string | null;
    acknowledged_at: string | null;
    signature_ref: string | null;
    signature_sha256: string | null;
    signed_with_password: boolean;
  }>`
    select read_at, acknowledged_at, signature_ref, signature_sha256, signed_with_password
      from memo_recipients where memo_id = ${id} and user_id = ${me.id}`;

  const { require_password } = await getSigningSettings();

  /**
   * Everything sent out about this document, and whatever is on my own desk.
   *
   * Read before the access check, because being sent a document for approval is
   * itself a reason to be allowed to read it — the recipient is usually not in
   * the memo's audience at all.
   */
  const routes = await sql<{
    id: number; ref: string; ask: string; instructions: string | null; status: string;
    due_date: string | null; decision_note: string | null; decided_at: string | null;
    signature_ref: string | null; signature_sha256: string | null; seen_at: string | null;
    sender_id: number; sender: string; recipient_id: number; recipient: string;
    recipient_title: string | null; version: number;
  }>`
    select r.id, r.ref, r.ask, r.instructions, r.status, r.due_date, r.decision_note, r.decided_at,
           r.signature_ref, r.signature_sha256, r.seen_at, r.version,
           r.sender_id, s.full_name as sender,
           r.recipient_id, t.full_name as recipient, t.job_title as recipient_title
      from document_routes r
      join users s on s.id = r.sender_id
      join users t on t.id = r.recipient_id
     where r.memo_id = ${id}
     order by r.created_at desc`;

  const onMyDesk = routes.find((r) => r.recipient_id === me.id && r.status === "pending") ?? null;
  const involved = routes.some((r) => r.recipient_id === me.id || r.sender_id === me.id);

  if (!canViewMemo(memo, !!mine || involved, me)) notFound();
  const isOwner = canViewDelivery(memo, me);
  if (mine && !mine.read_at) await touchMemo(id);

  const receipts = isOwner
    ? await sql<{ user_id: number; full_name: string; avatar_url: string | null; department: string | null; read_at: string | null; acknowledged_at: string | null }>`
        select mr.user_id, u.full_name, u.avatar_url, d.name as department, mr.read_at, mr.acknowledged_at
          from memo_recipients mr
          join users u on u.id = mr.user_id
          left join departments d on d.id = u.department_id
         where mr.memo_id = ${id}
         order by mr.acknowledged_at desc nulls last, mr.read_at desc nulls last, u.full_name`
    : [];

  const reads = receipts.filter((r) => r.read_at).length;
  const acks = receipts.filter((r) => r.acknowledged_at).length;

  const annotations = await sql<{
    id: number; quote: string; occurrence: number; body: string; author: string;
    created_at: string; resolved_at: string | null; user_id: number;
  }>`
    select a.id, a.quote, a.occurrence, a.body, u.full_name as author,
           a.created_at, a.resolved_at, a.user_id
      from memo_annotations a join users u on u.id = a.user_id
     where a.memo_id = ${id} and a.version = ${memo.version}
     order by a.created_at`;

  // Who this document could be sent to, and the access levels to group them by.
  const mayRoute = memo.author_id === me.id && can(me, "document.route");
  const [candidates, levels] = mayRoute
    ? await Promise.all([
        sql<{ id: number; full_name: string; job_title: string | null; department: string | null; role_name: string; is_head: boolean }>`
          select u.id, u.full_name, u.job_title, d.name as department,
                 coalesce(r.name, u.role) as role_name,
                 exists (select 1 from departments hd where hd.head_id = u.id) as is_head
            from users u
            left join departments d on d.id = u.department_id
            left join roles r on r.key = u.role
           where u.status = 'active' and u.id <> ${me.id}
           order by u.full_name`,
        sql<{ key: string; name: string }>`select key, name from roles order by name`,
      ])
    : [[], []];

  return (
    <>
      <Link href="/memos" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
        ← Back to memos
      </Link>

      <PageHeader
        title={memo.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge value={memo.kind} />
            <Badge value={memo.priority} />
            <Badge value={memo.status} />
            {memo.version > 1 && <Badge value="revised" label={`Version ${memo.version}`} />}
            <span>
              {memo.ref} ·{" "}
              {memo.audience === "all"
                ? "All staff"
                : memo.audience === "department"
                  ? `${memo.department} department`
                  : "Selected recipients"}
            </span>
          </span>
        }
      >
        <BtnLink href={`/memos/${memo.id}/document`} variant={canEditMemo(memo, me) ? "primary" : "outline"} prefetch={false}>
          {canEditMemo(memo, me) ? "Review & edit" : "Print / PDF"}
        </BtnLink>
        {isOwner && memo.requires_ack && memo.status === "published" && (
          <BtnLink href={`/memos/${memo.id}/register`} variant="outline">
            Signature register
          </BtnLink>
        )}
        {isOwner && memo.status === "draft" && (
          <ActionForm action={publishMemo}>
            <input type="hidden" name="id" value={memo.id} />
            <SubmitBtn>Publish</SubmitBtn>
          </ActionForm>
        )}
        {mayRoute && (
          <RouteDocument action={routeDocument} memoId={memo.id} people={candidates} levels={levels} />
        )}
        {isOwner && memo.status === "published" && (
          <ActionForm action={archiveMemo}>
            <input type="hidden" name="id" value={memo.id} />
            <SubmitBtn variant="outline">Archive</SubmitBtn>
          </ActionForm>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
              <Avatar name={memo.author} size="lg" />
              <div>
                <p className="text-sm font-bold">{memo.author}</p>
                <p className="text-xs font-medium text-ink-soft">
                  {memo.author_title ?? "Staff"} ·{" "}
                  {memo.published_at ? fmtDateTime(memo.published_at) : `Draft created ${fmtDate(memo.created_at)}`}
                </p>
              </div>
            </div>

            {/* Sanitised on write and again here: the failure mode is stored XSS. */}
            <AnnotatedDocument
              memoId={memo.id}
              html={memo.body_html ? sanitizeHtml(memo.body_html) : null}
              plain={memo.body}
              addAction={addAnnotation}
              canComment
              annotations={annotations.map((a) => ({
                id: a.id,
                quote: a.quote,
                occurrence: a.occurrence,
                body: a.body,
                author: a.author,
                created_at: a.created_at,
                resolved_at: a.resolved_at,
                mine: a.user_id === me.id,
              }))}
            />

            {(memo.status === "draft" ? memo.author_signature : memo.author_signature_ref) && (
              <div className="mt-8 border-t border-line pt-4">
                <p className="mb-1 text-[11px] font-bold tracking-wider text-ink-soft uppercase">
                  {memo.status === "draft" ? "Signature preview — captured on publish" : "Signed"}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={(memo.status === "draft" ? memo.author_signature : memo.author_signature_ref)!}
                  alt={`${memo.author} signature`}
                  data-signature
                  className="h-16 object-contain object-left p-1"
                />
                <p className="mt-1 text-xs font-bold">{memo.author}</p>
                <p className="text-xs font-medium text-ink-soft">{memo.author_title}</p>
                {memo.author_signature_sha256 && memo.status !== "draft" && (
                  <p className="mt-1 font-mono text-[10px] text-ink-soft" title={memo.author_signature_sha256}>
                    sha256 {memo.author_signature_sha256.slice(0, 24)}…
                  </p>
                )}
              </div>
            )}

            {memo.file_id && (
              <a
                href={`/api/files/${memo.file_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-6 flex items-center gap-3 rounded-xl bg-canvas p-3 hover:bg-brand-50"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-brand-700 ring-1 ring-line ring-inset">
                  <Icon name="clip" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{memo.file_name}</span>
                  <span className="block text-xs font-medium text-ink-soft">{prettySize(memo.file_size ?? 0)} · open</span>
                </span>
              </a>
            )}
          </Card>

          {isOwner && receipts.length > 0 && (
            <Card>
              <CardTitle>
                Delivery — {reads}/{receipts.length} read{memo.requires_ack ? `, ${acks} signed` : ""}
              </CardTitle>
              <div className="-mx-5 max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-line">
                    {receipts.map((r) => (
                      <tr key={r.user_id}>
                        <td className="py-2.5 pl-5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.full_name} src={r.avatar_url} size="sm" />
                            <div>
                              <p className="text-sm font-bold">{r.full_name}</p>
                              <p className="text-[11px] font-medium text-ink-soft">{r.department ?? "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 text-xs font-semibold text-ink-soft">
                          {r.read_at ? `Read ${fmtDateTime(r.read_at)}` : "Not read"}
                        </td>
                        <td className="py-2.5 pr-5 text-right">
                          {memo.requires_ack ? (
                            <Badge value={r.acknowledged_at ? "approved" : "pending"} label={r.acknowledged_at ? "Signed" : "Awaiting"} />
                          ) : (
                            <Badge value={r.read_at ? "approved" : "draft"} label={r.read_at ? "Delivered" : "Unread"} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {onMyDesk && (
            <Card className="border-brand-300 bg-brand-50">
              <CardTitle>On your desk</CardTitle>
              <RouteDecision
                action={decideRoute}
                route={{
                  id: onMyDesk.id,
                  ref: onMyDesk.ref,
                  ask: onMyDesk.ask,
                  instructions: onMyDesk.instructions,
                  sender: onMyDesk.sender,
                  due_date: onMyDesk.due_date ? fmtDate(onMyDesk.due_date) : null,
                }}
                requirePassword={require_password}
                hasSignature={!!me.signature}
                previewHref={`/memos/${memo.id}/review/${onMyDesk.id}`}
              />
            </Card>
          )}

          {routes.length > 0 && (
            <Card>
              <CardTitle>Sent for approval</CardTitle>
              <ul className="-mx-1 divide-y divide-line">
                {routes.map((r) => (
                  <li key={r.id} className="px-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{r.recipient}</p>
                      <Badge
                        value={
                          r.status === "approved" ? "approved"
                          : r.status === "rejected" ? "rejected"
                          : r.status === "cancelled" ? "cancelled"
                          : "pending"
                        }
                        label={ROUTE_STATUS[r.status]}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] font-semibold text-ink-soft">
                      {r.ref} · to {askVerb(r.ask)} · from {r.sender}
                      {r.version !== memo.version && ` · sent against version ${r.version}`}
                    </p>
                    {r.instructions && (
                      <p className="mt-1.5 border-l-2 border-line pl-2 text-xs font-medium text-ink-soft italic">
                        {r.instructions}
                      </p>
                    )}
                    {r.decision_note && (
                      <p className="mt-1.5 text-xs font-medium">{r.decision_note}</p>
                    )}
                    {r.signature_ref && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.signature_ref}
                          alt={`${r.recipient} signature`}
                          data-signature
                          className="mt-2 h-12 object-contain object-left p-1.5"
                        />
                        <p className="text-[10px] font-medium text-ink-soft">
                          {r.recipient_title ?? ""}
                          {r.signature_sha256 && ` · sha256 ${r.signature_sha256.slice(0, 16)}…`}
                        </p>
                      </>
                    )}
                    <p className="mt-1 text-[11px] font-medium text-ink-soft">
                      {r.decided_at ? fmtDateTime(r.decided_at) : r.due_date ? `Needed by ${fmtDate(r.due_date)}` : "Awaiting"}
                    </p>
                    {r.status === "pending" && r.sender_id === me.id && (
                      <ActionForm action={cancelRoute} className="mt-1.5">
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitBtn variant="ghost">Withdraw</SubmitBtn>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {memo.requires_ack && mine && (
            <Card className={mine.acknowledged_at ? "" : "border-brand-300 bg-brand-50"}>
              <CardTitle>Acknowledgement</CardTitle>
              {mine.acknowledged_at ? (
                <>
                  <p className="text-sm font-semibold text-emerald-700">
                    You signed this on {fmtDateTime(mine.acknowledged_at)}.
                  </p>
                  {/* The snapshot taken at signing — not the signature currently on the profile. */}
                  {mine.signature_ref && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mine.signature_ref} alt="Your signature as signed" className="mt-3 h-14 rounded-lg object-contain object-left p-2" data-signature />
                  )}
                  {mine.signature_sha256 && (
                    <>
                      <p className="mt-2 font-mono text-[10px] break-all text-ink-soft" title="SHA-256 of the signature image as signed">
                        sha256 {mine.signature_sha256.slice(0, 32)}…
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-ink-soft">
                        {mine.signed_with_password ? "Password confirmed at signing" : "Signed from an active session"}
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-ink-soft">
                    This {memo.kind} requires your signature. Signing records your name, a copy of your signature, its
                    hash, the time, and your IP address
                    {require_password ? ", once you confirm your password" : ""}.
                  </p>
                  {me.signature ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={me.signature} alt="Your signature" className="mt-3 h-14 rounded-lg object-contain object-left p-2" data-signature />
                      <ActionForm action={acknowledgeMemo} className="mt-3 space-y-3">
                        <input type="hidden" name="id" value={memo.id} />
                        {require_password && (
                          <Field label="Confirm your password to sign">
                            <input
                              name="password"
                              type="password"
                              required
                              autoComplete="current-password"
                              placeholder="••••••••"
                              className="field"
                            />
                          </Field>
                        )}
                        <SubmitBtn className="w-full">Sign &amp; acknowledge</SubmitBtn>
                      </ActionForm>
                    </>
                  ) : (
                    <Link href="/settings/signature" className="mt-3 block rounded-xl bg-surface p-3 text-sm font-bold text-brand-700 ring-1 ring-brand-200 ring-inset">
                      Add your signature first →
                    </Link>
                  )}
                </>
              )}
            </Card>
          )}

          <Card>
            <CardTitle>Details</CardTitle>
            <dl className="space-y-3 text-sm">
              {[
                ["Reference", memo.ref],
                ["Type", titleCase(memo.kind)],
                ["Priority", titleCase(memo.priority)],
                ["Author", memo.author],
                ["Published", memo.published_at ? fmtDateTime(memo.published_at) : "—"],
                ["Acknowledgement", memo.requires_ack ? "Required" : "Not required"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4">
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
