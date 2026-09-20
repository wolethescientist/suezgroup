import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { prettySize } from "@/lib/attachments";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { periodLabel, type ReportKind } from "@/lib/periods";
import { Avatar, Badge, Card, CardTitle, Empty, PageHeader } from "@/components/ui";
import { ActionForm, ConfirmBtn, Dialog, SubmitBtn } from "@/components/form";
import { Icon } from "@/components/icons";
import { addReportFiles, removeReportFile, reviewReport } from "@/lib/actions/reports";

export const metadata = { title: "Report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);

  const [report] = await sql<{
    id: number; ref: string; kind: string; period_start: string; period_end: string;
    title: string; summary: string; body_html: string | null; status: string;
    submitted_at: string | null; reviewed_at: string | null; review_note: string | null;
    user_id: number; author: string; author_avatar: string | null; job_title: string | null;
    department: string | null; reviewer: string | null;
  }>`
    select r.id, r.ref, r.kind, r.period_start, r.period_end, r.title, r.summary, r.body_html,
           r.status, r.submitted_at, r.reviewed_at, r.review_note, r.user_id,
           u.full_name as author, u.avatar_url as author_avatar, u.job_title,
           d.name as department, rv.full_name as reviewer
      from staff_reports r
      join users u on u.id = r.user_id
      left join departments d on d.id = u.department_id
      left join users rv on rv.id = r.reviewed_by
     where r.id = ${id}`;
  if (!report) notFound();

  const mine = report.user_id === me.id;
  const receives = can(me, "report.view_all");
  // A draft belongs to nobody but its author, even to the people who receive reports.
  if (!mine && !(receives && report.status !== "draft")) notFound();

  const files = await sql<{ attachment_id: number; name: string; mime: string; size_bytes: number }>`
    select f.attachment_id, a.name, a.mime, a.size_bytes
      from report_files f join attachments a on a.id = f.attachment_id
     where f.report_id = ${id}
     order by a.name`;

  const editable = mine && (report.status === "draft" || report.status === "returned");

  return (
    <>
      <PageHeader
        title={report.title}
        subtitle={`${report.ref} · ${report.kind === "weekly" ? "Weekly" : "Monthly"} report · ${periodLabel(report.kind as ReportKind, report.period_start)}`}
      >
        <Badge value={report.status} />
        {editable && (
          <Link
            href={`/reports/new?kind=${report.kind}&period=${report.period_start}`}
            className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold hover:bg-line/40"
          >
            Edit
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="-mt-1 mb-4 flex items-center gap-3 border-b border-line pb-4">
              <Avatar name={report.author} src={report.author_avatar} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{report.author}</p>
                <p className="truncate text-xs font-medium text-ink-soft">
                  {[report.job_title, report.department].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <p className="ml-auto shrink-0 text-right text-[11px] font-semibold text-ink-soft">
                {report.submitted_at ? `Sent ${fmtDateTime(report.submitted_at)}` : "Not sent yet"}
                <span className="block">
                  {fmtDate(report.period_start)} – {fmtDate(report.period_end)}
                </span>
              </p>
            </div>

            <div>
              {report.summary && <p className="mb-4 text-sm font-semibold">{report.summary}</p>}
              {report.body_html ? (
                <div className="doc-body text-[15px] leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: report.body_html }} />
              ) : (
                !report.summary && <Empty title="No written report" hint="The attached document is the report." />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle
              action={
                editable ? (
                  <Dialog label="Attach" variant="ghost" title="Attach a document">
                    <ActionForm action={addReportFiles} className="grid gap-4">
                      <input type="hidden" name="id" value={report.id} />
                      <input
                        type="file"
                        name="files"
                        multiple
                        accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,application/pdf"
                        className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700"
                      />
                      <SubmitBtn>Attach</SubmitBtn>
                    </ActionForm>
                  </Dialog>
                ) : undefined
              }
            >
              Documents
            </CardTitle>
            {files.length === 0 ? (
              <Empty title="Nothing attached" hint="Slide decks and documents appear here." />
            ) : (
              <ul className="-mx-1 divide-y divide-line">
                {files.map((f) => (
                  <li key={f.attachment_id} className="flex items-center gap-3 px-1 py-3">
                    <Icon name="doc" className="h-4 w-4 shrink-0 text-ink-soft" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{f.name}</span>
                      <span className="block text-[11px] font-semibold text-ink-soft">{prettySize(f.size_bytes)}</span>
                    </span>
                    <a
                      href={`/api/files/${f.attachment_id}`}
                      className="shrink-0 rounded-lg bg-canvas px-2.5 py-1 text-xs font-bold hover:bg-line/40"
                    >
                      Download
                    </a>
                    {editable && (
                      <ActionForm action={removeReportFile}>
                        <input type="hidden" name="id" value={report.id} />
                        <input type="hidden" name="attachment_id" value={f.attachment_id} />
                        <ConfirmBtn
                          title={`Remove ${f.name}?`}
                          body="It is detached from this report. The file itself is kept."
                          confirmLabel="Remove"
                        >
                          Remove
                        </ConfirmBtn>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {report.reviewed_at && (
            <Card>
              <CardTitle>HR's response</CardTitle>
              <div>
                <p className="text-sm font-bold capitalize">{report.status}</p>
                <p className="mt-1 text-xs font-medium text-ink-soft">
                  {report.reviewer} · {fmtDateTime(report.reviewed_at)}
                </p>
                {report.review_note && <p className="mt-2 text-sm font-medium">{report.review_note}</p>}
              </div>
            </Card>
          )}

          {receives && !mine && report.status !== "draft" && (
            <Card>
              <CardTitle>Your response</CardTitle>
              <div>
                <ActionForm action={reviewReport} className="grid gap-3">
                  <input type="hidden" name="id" value={report.id} />
                  <textarea
                    name="note"
                    rows={3}
                    placeholder="Optional when accepting. Required when sending it back."
                    className="field"
                  />
                  <div className="flex flex-wrap gap-2">
                    <SubmitBtn name="decision" value="acknowledged">Accept</SubmitBtn>
                    <SubmitBtn name="decision" value="returned" variant="outline">Send back</SubmitBtn>
                  </div>
                </ActionForm>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
