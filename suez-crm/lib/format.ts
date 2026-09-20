const LOCALE = "en-GB";

/**
 * Dates are read and written in the organisation's timezone, not the server's.
 *
 * ponytail: a <input type="datetime-local"> posts a naive wall-clock string with
 * no zone. It went straight into a timestamptz column, where Postgres read it as
 * UTC, and came back rendered in the process timezone — so a rep who booked a
 * site visit for 10:00 saw 11:00. Both ends now agree. These live here rather
 * than in their own module because this file has no relative imports, which is
 * what lets the test runner load it directly.
 */

/** Fallback when the organisation setting has not been filled in. */
export const DEFAULT_TZ = "Africa/Lagos";

/** Milliseconds that `timeZone` is ahead of UTC at the given instant. */
function offsetAt(instant: Date, timeZone: string) {
  const zoned = new Date(instant.toLocaleString("en-US", { timeZone }));
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  return zoned.getTime() - utc.getTime();
}

/**
 * Reads a naive "YYYY-MM-DDTHH:mm" as a wall-clock time in `timeZone` and
 * returns the matching UTC instant, ready for a timestamptz column.
 */
export function zonedToUtc(value: string | null | undefined, timeZone = DEFAULT_TZ): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return value; // a plain date, or something already zoned — leave it alone
  const [, y, mo, d, h, mi] = m;
  const pretendUtc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  // Two passes, so an instant either side of a DST change still lands correctly.
  let guess = new Date(pretendUtc.getTime() - offsetAt(pretendUtc, timeZone));
  guess = new Date(pretendUtc.getTime() - offsetAt(guess, timeZone));
  return guess.toISOString();
}

/** The inverse: a UTC instant as the "YYYY-MM-DDTHH:mm" a datetime-local wants. */
export function utcToZonedInput(value: string | Date | null | undefined, timeZone = DEFAULT_TZ): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const timeZone = DEFAULT_TZ;

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString(LOCALE, { timeZone, day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString(LOCALE, { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString(LOCALE, { timeZone, hour: "2-digit", minute: "2-digit" });

export function timeAgo(d: string | Date | null | undefined) {
  if (!d) return "—";
  const secs = (Date.now() - new Date(d).getTime()) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
    [Infinity, "year"],
  ];
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  let prev = 1;
  for (const [limit, unit] of steps) {
    if (Math.abs(secs) < limit) return rtf.format(-Math.round(secs / prev), unit);
    prev = limit;
  }
  return "—";
}

export const money = (v: number | string | null | undefined, currency = "NGN") =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(v ?? 0));

export const compactMoney = (v: number | string | null | undefined, currency = "NGN") =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(
    Number(v ?? 0),
  );

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Working days between two ISO dates, inclusive, skipping Sat/Sun. */
export function workingDays(start: string, end: string) {
  const a = new Date(start + "T00:00:00Z");
  const b = new Date(end + "T00:00:00Z");
  if (isNaN(+a) || isNaN(+b) || b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}
