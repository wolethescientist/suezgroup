const LOCALE = "en-GB";

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString(LOCALE, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

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

/** Abbreviations that must not be sentence-cased — "IT", not "It"; "PO", not "Po". */
const ACRONYMS = new Set(["it", "po", "pr", "hr", "vat", "sku", "id", "pdf", "erp", "crm", "imap", "smtp", "rc", "tin"]);

export const titleCase = (s: string) =>
  s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.replace(/\b\w/g, (c) => c.toUpperCase())))
    .join(" ");

/**
 * Turns an audit key like "po.receive" or "auth.login.failed" into something a
 * person reads. The security page used to render these raw and title-cased,
 * which produced "Po Receive" and "Auth Login".
 */
const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.login.failed": "Failed sign-in attempt",
  "auth.login.blocked": "Sign-in blocked — too many attempts",
  "password.change": "Password changed",
  "profile.update": "Profile updated",
  "signature.save": "Signature saved",
  "signature.clear": "Signature deleted",
  "memo.publish": "Published a document",
  "memo.draft": "Saved a draft document",
  "memo.acknowledge": "Signed a document",
  "po.create": "Raised a purchase order",
  "po.receive": "Received goods on a purchase order",
  "po.status": "Changed a purchase order's status",
  "stock.move": "Recorded a stock movement",
  "invoice.create": "Raised an invoice",
  "invoice.payment": "Recorded a payment",
  "expense.claim": "Claimed an expense",
  "timesheet.save": "Saved a timesheet",
  "timesheet.submit": "Submitted a timesheet",
};

export const auditLabel = (action: string) =>
  AUDIT_LABELS[action] ??
  titleCase(action.replace(/\./g, " ").replace(/\b(approved|rejected|create|update|delete)\b/g, (m) => m));

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
