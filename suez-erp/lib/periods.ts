/**
 * Reporting periods.
 *
 * A weekly report covers the week the Monday meeting opens — Monday to Sunday.
 * A monthly report covers a calendar month. Both are identified by the date
 * they start, which is what `staff_reports.period_start` holds and what makes
 * "one report per person per period" expressible as a unique constraint.
 */

export type ReportKind = "weekly" | "monthly";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Parses YYYY-MM-DD as a plain calendar date, never shifted by the timezone. */
const day = (s: string) => new Date(`${s}T00:00:00Z`);

export function weekStart(on: string) {
  const d = day(on);
  // getUTCDay: Sunday is 0, so Sunday belongs to the week that began six days ago.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

export function monthStart(on: string) {
  return `${on.slice(0, 7)}-01`;
}

export function periodStart(kind: ReportKind, on: string) {
  return kind === "weekly" ? weekStart(on) : monthStart(on);
}

export function periodEnd(kind: ReportKind, start: string) {
  const d = day(start);
  if (kind === "weekly") d.setUTCDate(d.getUTCDate() + 6);
  else {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(0);
  }
  return iso(d);
}

/** The period before this one — what "last week's report" means on a Monday. */
export function shiftPeriod(kind: ReportKind, start: string, by: number) {
  const d = day(start);
  if (kind === "weekly") d.setUTCDate(d.getUTCDate() + by * 7);
  else d.setUTCMonth(d.getUTCMonth() + by);
  return iso(d);
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** "Week of 15 Sep 2026" / "September 2026" — how a period is named on screen. */
export function periodLabel(kind: ReportKind, start: string) {
  const d = day(start);
  if (kind === "monthly") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const end = day(periodEnd("weekly", start));
  const sameMonth = end.getUTCMonth() === d.getUTCMonth();
  const left = `${d.getUTCDate()}${sameMonth ? "" : ` ${MONTHS[d.getUTCMonth()].slice(0, 3)}`}`;
  return `${left}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()].slice(0, 3)} ${end.getUTCFullYear()}`;
}

/** The period a report submitted today is normally about: the one just ended. */
export function currentReportingPeriod(kind: ReportKind, today = iso(new Date())) {
  return shiftPeriod(kind, periodStart(kind, today), -1);
}

/** The last `n` periods, newest first, for the period picker. */
export function recentPeriods(kind: ReportKind, n: number, today = iso(new Date())) {
  const from = periodStart(kind, today);
  return Array.from({ length: n }, (_, i) => shiftPeriod(kind, from, -i));
}

export const REPORT_KINDS: { key: ReportKind; label: string; noun: string }[] = [
  { key: "weekly", label: "Weekly report", noun: "week" },
  { key: "monthly", label: "Monthly report", noun: "month" },
];

export const isReportKind = (s: string): s is ReportKind => s === "weekly" || s === "monthly";
