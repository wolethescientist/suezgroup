import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { currentReportingPeriod, isReportKind, periodStart, recentPeriods, type ReportKind } from "@/lib/periods";
import { PageHeader } from "@/components/ui";
import { ReportComposer } from "@/components/report-composer";
import { submitReport } from "@/lib/actions/reports";

export const metadata = { title: "Write a report" };

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; period?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;

  const kind: ReportKind = isReportKind(sp.kind ?? "") ? (sp.kind as ReportKind) : "weekly";
  const period = sp.period ? periodStart(kind, sp.period) : currentReportingPeriod(kind);

  // An unsent draft for the same period is picked back up rather than duplicated.
  const [draft] = await sql<{ id: number; title: string; summary: string; body_html: string | null; status: string }>`
    select id, title, summary, body_html, status from staff_reports
     where user_id = ${me.id} and kind = ${kind} and period_start = ${period}
       and status in ('draft','returned')`;

  return (
    <>
      <PageHeader
        title={draft ? "Continue your report" : "Write a report"}
        subtitle="Say what happened, attach the deck or the document, and it goes to HR with the rest of the team's."
      />
      <ReportComposer
        action={submitReport}
        kind={kind}
        period={period}
        periods={{ weekly: recentPeriods("weekly", 8), monthly: recentPeriods("monthly", 6) }}
        draft={draft ?? null}
      />
    </>
  );
}
