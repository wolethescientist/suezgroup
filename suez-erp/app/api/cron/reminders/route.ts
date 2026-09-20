import { currentReportingPeriod } from "@/lib/periods";
import { sendReportReminders } from "@/lib/reports";

/**
 * Report reminders, for a scheduler to call.
 *
 * ponytail: HR asked for a reminder and there was no scheduler in the system at
 * all, so this is the seam for one — Vercel Cron, a GitHub Action, or a plain
 * `curl` from crontab. The Remind button on Reports received does the same
 * thing by hand, and neither can double-chase anyone: `report_reminders` records
 * who has already been told for a period.
 *
 * Suggested schedule — Monday 08:00 for the week, the 1st at 08:00 for the month:
 *   0 8 * * 1  curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/reminders
 *   0 8 1 * *  …the same URL; it works out which reminders are due from the date.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET is not set", { status: 503 });

  const auth = request.headers.get("authorization") ?? "";
  const url = new URL(request.url);
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("key") ?? "";
  if (presented !== secret) return new Response("Forbidden", { status: 403 });

  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const force = url.searchParams.get("force") === "1";

  // Which reminders today calls for. `kind=` overrides it, for testing and for
  // a scheduler that would rather be explicit than rely on the date.
  const asked = url.searchParams.get("kind");
  const due: ("weekly" | "monthly")[] = asked
    ? asked.split(",").filter((k): k is "weekly" | "monthly" => k === "weekly" || k === "monthly")
    : [
        ...(today.getUTCDay() === 1 ? (["weekly"] as const) : []),
        ...(today.getUTCDate() === 1 ? (["monthly"] as const) : []),
      ];

  const done: Record<string, number> = {};
  for (const kind of due) {
    const period = currentReportingPeriod(kind, iso);
    const { reminded } = await sendReportReminders(kind, period, null, force);
    done[`${kind}:${period}`] = reminded;
  }

  return Response.json({ ran: iso, due, reminded: done });
}
