import Link from "next/link";
import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import {
  currentReportingPeriod,
  isReportKind,
  periodLabel,
  periodStart,
  recentPeriods,
  type ReportKind,
} from "@/lib/periods";
import { Avatar, Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { remindOutstanding } from "@/lib/actions/reports";

export const metadata = { title: "Reports received" };

/**
 * HR's desk: everything submitted for a period, and — the part that was
 * impossible before — everyone who has not submitted, with one button to chase
 * them.
 */
export default async function ReceivedReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; period?: string }>;
}) {
  await requireCap("report.view_all");
  const sp = await searchParams;

  const kind: ReportKind = isReportKind(sp.kind ?? "") ? (sp.kind as ReportKind) : "weekly";
  const period = sp.period ? periodStart(kind, sp.period) : currentReportingPeriod(kind);
  const periods = recentPeriods(kind, kind === "weekly" ? 10 : 8);

  const [submitted, outstanding] = await Promise.all([
    sql<{
      id: number; ref: string; title: string; summary: string; status: string; submitted_at: string;
      full_name: string; avatar_url: string | null; department: string | null;
      files: number; first_file: number | null;
    }>`
      select r.id, r.ref, r.title, r.summary, r.status, r.submitted_at,
             u.full_name, u.avatar_url, d.name as department,
             (select count(*) from report_files f where f.report_id = r.id)::int as files,
             (select f.attachment_id from report_files f where f.report_id = r.id order by f.id limit 1) as first_file
        from staff_reports r
        join users u on u.id = r.user_id
        left join departments d on d.id = u.department_id
       where r.kind = ${kind} and r.period_start = ${period} and r.status <> 'draft'
       order by r.submitted_at desc`,
    sql<{ id: number; full_name: string; avatar_url: string | null; department: string | null; reminded_at: string | null }>`
      select u.id, u.full_name, u.avatar_url, d.name as department,
             (select rr.sent_at from report_reminders rr
               where rr.user_id = u.id and rr.kind = ${kind} and rr.period_start = ${period}) as reminded_at
        from users u
        left join departments d on d.id = u.department_id
       where u.status = 'active'
         and not exists (
           select 1 from staff_reports r
            where r.user_id = u.id and r.kind = ${kind} and r.period_start = ${period} and r.status <> 'draft')
       order by u.full_name`,
  ]);

  const unreviewed = submitted.filter((r) => r.status === "submitted").length;
  const query = `kind=${kind}&period=${period}`;

  return (
    <>
      <PageHeader
        title="Reports received"
        subtitle={`${kind === "weekly" ? "Weekly" : "Monthly"} reports for ${periodLabel(kind, period)}.`}
      >
        <Link href="/reports" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold hover:bg-line/40">
          My reports
        </Link>
        <a
          href={`/api/export/reports?kind=${kind}&from=${period}&to=${period}`}
          className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-on-brand hover:bg-brand-700"
        >
          Download CSV
        </a>
      </PageHeader>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Submitted" value={submitted.length} tone="emerald" />
        <Stat label="Awaiting your response" value={unreviewed} tone={unreviewed ? "amber" : "brand"} />
        <Stat label="Outstanding" value={outstanding.length} tone={outstanding.length ? "amber" : "emerald"} />
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          Type
          <select name="kind" defaultValue={kind} className="field">
            <option value="weekly">Weekly reports</option>
            <option value="monthly">Monthly reports</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          Period
          <select name="period" defaultValue={period} className="field">
            {periods.map((p) => (
              <option key={p} value={p}>{periodLabel(kind, p)}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">Show</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <Card>
          <CardTitle>Submitted</CardTitle>
          {submitted.length === 0 ? (
            <Empty title="Nothing in yet" hint="Reports for this period will appear here as they arrive." />
          ) : (
            <Table head={["From", "Report", "Files", "Status", "Sent", ""]}>
              {submitted.map((r) => (
                <tr key={r.id} className="hover:bg-canvas">
                  <Td>
                    <span className="flex items-center gap-2">
                      <Avatar name={r.full_name} src={r.avatar_url} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{r.full_name}</span>
                        <span className="block truncate text-[11px] font-semibold text-ink-soft">{r.department ?? "—"}</span>
                      </span>
                    </span>
                  </Td>
                  <Td className="max-w-[18rem]">
                    <span className="block truncate font-semibold">{r.title}</span>
                    {r.summary && <span className="block truncate text-[11px] text-ink-soft">{r.summary}</span>}
                  </Td>
                  <Td className="tabular">
                    {r.first_file ? (
                      <a href={`/api/files/${r.first_file}`} className="font-bold text-brand-700 hover:underline">
                        {r.files}
                      </a>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </Td>
                  <Td><Badge value={r.status} /></Td>
                  <Td className="text-[11px] font-semibold text-ink-soft">{fmtDateTime(r.submitted_at)}</Td>
                  <Td>
                    <Link href={`/reports/${r.id}`} className="text-xs font-bold text-brand-700 hover:underline">Open</Link>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardTitle
            action={
              outstanding.length > 0 ? (
                <ActionForm action={remindOutstanding}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="period_start" value={period} />
                  <SubmitBtn variant="outline">Remind</SubmitBtn>
                </ActionForm>
              ) : undefined
            }
          >
            Still outstanding
          </CardTitle>
          {outstanding.length === 0 ? (
            <Empty title="Everyone has reported" hint={`Nothing outstanding for ${periodLabel(kind, period)}.`} />
          ) : (
            <ul className="-mx-1 divide-y divide-line">
              {outstanding.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-1 py-3">
                  <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{p.full_name}</span>
                    <span className="block truncate text-[11px] font-semibold text-ink-soft">{p.department ?? "—"}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-ink-soft">
                    {p.reminded_at ? `reminded ${fmtDateTime(p.reminded_at)}` : "not reminded"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {outstanding.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <ActionForm action={remindOutstanding} className="flex items-center justify-between gap-2">
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="period_start" value={period} />
                <input type="hidden" name="force" value="1" />
                <span className="text-[11px] font-medium text-ink-soft">
                  Remind again, including people already chased.
                </span>
                <SubmitBtn variant="ghost">Remind again</SubmitBtn>
              </ActionForm>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
