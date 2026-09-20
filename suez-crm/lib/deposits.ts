import { sql } from "./db";
import { can } from "./permissions";
import type { SessionUser } from "./auth";

/**
 * Customer deposit accounts.
 *
 * The shape of the thing: a customer hands over a sum, and then asks for goods
 * against it until it is gone. The balance is always the sum of the ledger,
 * never a stored number, because a stored balance that disagrees with its own
 * ledger is the one way this can go badly wrong.
 */

export type DepositRow = {
  id: number;
  ref: string;
  company_id: number;
  company: string;
  name: string;
  currency: string;
  status: string;
  opened_on: string;
  low_balance_ratio: string;
  owner_id: number | null;
  owner: string | null;
  notes: string | null;
  funded: string;
  drawn: string;
  balance: string;
  drawdowns: number;
  last_movement_on: string | null;
};

/**
 * Who may see which accounts.
 *
 * `deposit.view` sees everything. Without it you see the accounts you own and
 * the accounts on companies you own — a rep should be able to answer "how much
 * is left" for their own customer without being shown everybody's client money.
 */
export function visibleDeposits(me: SessionUser) {
  return can(me, "deposit.view");
}

export async function listDeposits(me: SessionUser, opts: { companyId?: number; q?: string } = {}) {
  const wide = visibleDeposits(me);
  const q = opts.q?.trim() ?? "";
  const like = `%${q}%`;
  return sql<DepositRow>`
    select d.id, d.ref, d.company_id, c.name as company, d.name, d.currency, d.status,
           d.opened_on, d.low_balance_ratio, d.owner_id, u.full_name as owner, d.notes,
           b.funded, b.drawn, b.balance, b.drawdowns, b.last_movement_on
      from crm_deposits d
      join crm_companies c on c.id = d.company_id
      join crm_deposit_balances b on b.deposit_id = d.id
      left join users u on u.id = d.owner_id
     where (${opts.companyId ?? 0} = 0 or d.company_id = ${opts.companyId ?? 0})
       and (${q} = '' or c.name ilike ${like} or d.name ilike ${like} or d.ref ilike ${like})
       and (${wide} or d.owner_id = ${me.id} or c.owner_id = ${me.id})
     order by d.status, b.balance desc, c.name`;
}

export async function getDeposit(me: SessionUser, id: number) {
  const wide = visibleDeposits(me);
  const [deposit] = await sql<DepositRow>`
    select d.id, d.ref, d.company_id, c.name as company, d.name, d.currency, d.status,
           d.opened_on, d.low_balance_ratio, d.owner_id, u.full_name as owner, d.notes,
           b.funded, b.drawn, b.balance, b.drawdowns, b.last_movement_on
      from crm_deposits d
      join crm_companies c on c.id = d.company_id
      join crm_deposit_balances b on b.deposit_id = d.id
      left join users u on u.id = d.owner_id
     where d.id = ${id}
       and (${wide} or d.owner_id = ${me.id} or c.owner_id = ${me.id})`;
  return deposit ?? null;
}

export type LedgerEntry = {
  id: string;
  ref: string;
  kind: string;
  amount: string;
  occurred_on: string;
  description: string;
  reference: string | null;
  attachment_id: number | null;
  file_name: string | null;
  recorded_by: number | null;
  recorded_by_name: string | null;
  created_at: string;
  items: { description: string; quantity: string; unit_price: string; line_total: string }[];
};

export async function ledgerFor(depositId: number) {
  const entries = await sql<Omit<LedgerEntry, "items">>`
    select e.id, e.ref, e.kind, e.amount, e.occurred_on, e.description, e.reference,
           e.attachment_id, a.name as file_name, e.recorded_by, u.full_name as recorded_by_name, e.created_at
      from crm_deposit_entries e
      left join users u on u.id = e.recorded_by
      left join attachments a on a.id = e.attachment_id
     where e.deposit_id = ${depositId}
     order by e.occurred_on desc, e.id desc`;
  if (!entries.length) return [] as LedgerEntry[];

  const items = await sql<{ entry_id: string; description: string; quantity: string; unit_price: string; line_total: string }>`
    select entry_id, description, quantity, unit_price, line_total
      from crm_deposit_items
     where entry_id = any(${entries.map((e) => Number(e.id))}::bigint[])
     order by id`;

  const byEntry = new Map<string, LedgerEntry["items"]>();
  for (const i of items) {
    const list = byEntry.get(String(i.entry_id)) ?? [];
    list.push({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total });
    byEntry.set(String(i.entry_id), list);
  }
  return entries.map((e) => ({ ...e, items: byEntry.get(String(e.id)) ?? [] }));
}

/** How the ledger describes each kind of movement, on screen and in the CSV. */
export const ENTRY_KINDS: Record<string, { label: string; direction: "in" | "out"; tone: string }> = {
  funding: { label: "Funding received", direction: "in", tone: "emerald" },
  drawdown: { label: "Drawdown", direction: "out", tone: "amber" },
  refund: { label: "Refund to customer", direction: "out", tone: "rose" },
  adjustment: { label: "Adjustment", direction: "in", tone: "sky" },
};

/** Share of the original funding still unspent, 0..1. */
export const remainingRatio = (funded: number, balance: number) =>
  funded <= 0 ? 0 : Math.max(0, Math.min(1, balance / funded));

export const isExhausted = (balance: number) => balance <= 0;
