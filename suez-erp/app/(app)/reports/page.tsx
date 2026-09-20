import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { currentReportingPeriod, periodLabel, REPORT_KINDS, type ReportKind } from "@/lib/periods";
import { Badge, BtnLink, Card, CardTitle, Empty, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "My reports" };

/**
 * The reports an employee owes and the ones they have sent.
 *
 * ponytail: the Monday meeting produced a report that went to HR by email or
 * on paper, and the month produced another. Neither was anywhere the person who
 * had to chase them could see, so "who has not sent theirs in" was answered by
 * scrolling an inbox.
 */
export default async function ReportsPage() {
  const me = await requireUser();

  const rows = await sql<{
    id: number; ref: string; kind: string; period_start: string; title: string;
    status: string; submitted_at: string | null; files: number; review_note: string | null;
  }>`
    select r.id, r.ref, r.kind, r.period_start, r.title, r.status, r.submitted_at, r.review_note,
           (select count(*) from report_files f where f.report_id = r.id)::int as files
      from staff_reports r
     where r.user_id = ${me.id}
     order by r.period_start desc, r.kind
     limit 60`;

  // What is owed right now: the period just ended, for each kind, unless it has
  // already gone in.
  const outstanding = REPORT_KINDS.map(({ key, label }) => {
    const period = currentReportingPeriod(key as ReportKind);
    const sent = rows.find((r) => r.kind === key && r.period_start === period && r.status !== "draft");
    return { key: key as ReportKind, label, period, sent };
  }).filter((o) => !o.sent);

  return (
    <>
      <PageHeader title="My reports" subtitle="The weekly meeting report and the monthly report, sent straight to HR.">
        {can(me, "report.view_all") && <BtnLink href="/reports/received" variant="ghost">Reports received</BtnLink>}
        <BtnLink href="/reports/new">Write a report</BtnLink>
      </PageHeader>

      {outstanding.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {outstanding.map((o) => (
            <Link
              key={o.key}
              href={`/reports/new?kind=${o.key}&period=${o.period}`}
              className="card flex items-center justify-between gap-3 p-4 card-hover"
            >
              <span>
                <span className="block text-sm font-bold">{o.label} outstanding</span>
                <span className="block text-xs font-medium text-ink-soft">{periodLabel(o.key, o.period)}</span>
              </span>
              <span className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">Submit</span>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardTitle>Sent and drafted</CardTitle>
        {rows.length === 0 ? (
          <Empty title="No reports yet" hint="Write your first one and it lands on HR's desk immediately." />
        ) : (
          <Table head={["Reference", "Type", "Period", "Title", "Files", "Status", ""]}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <Td className="font-bold tabular">{r.ref}</Td>
                <Td className="capitalize">{r.kind}</Td>
                <Td>{periodLabel(r.kind as ReportKind, r.period_start)}</Td>
                <Td className="max-w-[18rem] truncate font-semibold">{r.title}</Td>
                <Td className="tabular">{r.files || "—"}</Td>
                <Td>
                  <Badge value={r.status} />
                  {r.status === "returned" && r.review_note && (
                    <span className="mt-0.5 block max-w-[14rem] truncate text-[11px] font-semibold text-amber-700">
                      {r.review_note}
                    </span>
                  )}
                </Td>
                <Td>
                  <Link href={`/reports/${r.id}`} className="text-xs font-bold text-brand-700 hover:underline">
                    Open
                  </Link>
                  {r.submitted_at && (
                    <span className="block text-[11px] font-medium text-ink-soft">{fmtDate(r.submitted_at)}</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
