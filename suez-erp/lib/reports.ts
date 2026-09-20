import { sql } from "./db";
import { audit } from "./audit";
import { notify } from "./notify";
import { periodLabel, type ReportKind } from "./periods";

/**
 * Chases whoever has not submitted for a period.
 *
 * `report_reminders` records who has already been told, so running this twice
 * in a morning does not mail the same person twice. `force` is the deliberate
 * second nudge, and still writes a fresh row.
 */
export async function sendReportReminders(kind: ReportKind, periodFrom: string, by: { id: number } | null, force = false) {
  const due = await sql<{ id: number; full_name: string; email: string }>`
    select u.id, u.full_name, u.email
      from users u
     where u.status = 'active'
       and not exists (
         select 1 from staff_reports r
          where r.user_id = u.id and r.kind = ${kind} and r.period_start = ${periodFrom}
            and r.status <> 'draft')
       and (${force} or not exists (
         select 1 from report_reminders rr
          where rr.user_id = u.id and rr.kind = ${kind} and rr.period_start = ${periodFrom}))
     order by u.full_name`;
  if (!due.length) return { reminded: 0 };

  await notify(
    due.map((d) => d.id),
    `${kind === "weekly" ? "Weekly" : "Monthly"} report due`,
    `Your report for ${periodLabel(kind, periodFrom)} has not been submitted yet.`,
    `/reports/new?kind=${kind}&period=${periodFrom}`,
    {
      kind: "report",
      entity: "staff_report",
      actionLabel: "Submit the report",
      emailBody: `<p>Please submit it through the portal so it reaches HR with the rest of the team's.</p>`,
    },
  );

  for (const d of due) {
    await sql`
      insert into report_reminders (kind, period_start, user_id) values (${kind}, ${periodFrom}, ${d.id})
      on conflict (kind, period_start, user_id) do update set sent_at = now()`;
  }
  await audit(by?.id ?? null, "report.remind", "staff_report", undefined, { kind, period: periodFrom, count: due.length });
  return { reminded: due.length };
}
