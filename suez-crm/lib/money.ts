/**
 * The arithmetic behind invoices, quotes, purchase orders and the asset register.
 *
 * Pulled out of the server actions so it can be tested without a database or a
 * session. These are the numbers a client sees on a document and finance books
 * against a budget, so they are worth pinning down in tests rather than
 * re-deriving inline in four places.
 */

/** Rounds to whole minor units (kobo). Money must never carry float dust. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type Line = { quantity: number; unit_price: number };

export const lineTotal = (l: Line) => round2(l.quantity * l.unit_price);

export const subtotalOf = (lines: Line[]) => round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));

/**
 * Discount comes off before tax — VAT is charged on what is actually payable,
 * not on the list price. A discount larger than the subtotal cannot make the
 * net negative.
 */
export function documentTotals(lines: Line[], opts: { taxRate?: number; discount?: number } = {}) {
  const taxRate = opts.taxRate ?? 7.5;
  const discount = Math.max(0, opts.discount ?? 0);
  const subtotal = subtotalOf(lines);
  const net = Math.max(0, round2(subtotal - discount));
  const tax = round2(net * (taxRate / 100));
  return { subtotal, discount: Math.min(discount, subtotal), net, taxRate, tax, total: round2(net + tax) };
}

/** What an invoice's status should be, given what has actually been received. */
export function paymentStatus(total: number, paid: number, current: string) {
  if (current === "void") return "void";
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "part_paid";
  return current;
}

export const outstanding = (total: number, paid: number) => round2(Math.max(0, total - paid));

/**
 * Straight-line depreciation, floored at zero and capped at cost.
 * An asset with no purchase date, or a nonsensical life, is carried at cost
 * rather than silently written down.
 */
export function netBookValue(cost: number, purchaseDate: string | null, usefulLifeYears: number, asOf = new Date()) {
  if (!purchaseDate || !Number.isFinite(cost) || cost <= 0) return round2(Math.max(0, cost || 0));
  const life = Number(usefulLifeYears);
  if (!Number.isFinite(life) || life <= 0) return round2(cost);
  const years = (asOf.getTime() - new Date(purchaseDate).getTime()) / 31_557_600_000;
  if (years <= 0) return round2(cost);
  return round2(cost * (1 - Math.min(1, years / life)));
}

/** Response deadline for a support ticket, from its priority. */
export const ticketDueHours = (priority: string) => (priority === "urgent" ? 4 : priority === "high" ? 24 : 72);
