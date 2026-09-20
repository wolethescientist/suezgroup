"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify, usersWithCapability } from "@/lib/notify";
import { saveUpload } from "@/lib/attachments";
import { round2 } from "@/lib/money";
import { money } from "@/lib/format";
import { getDeposit, remainingRatio } from "@/lib/deposits";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => Number(str(fd, k).replace(/[, ]/g, ""));

/** The lines the form posts, zipped back up. Mirrors the quote line editor. */
function linesFrom(fd: FormData) {
  const descriptions = fd.getAll("line_desc").map((v) => v.toString().trim());
  const quantities = fd.getAll("line_qty").map((v) => Number(v.toString()));
  const prices = fd.getAll("line_price").map((v) => Number(v.toString()));
  return descriptions
    .map((description, i) => ({
      description,
      quantity: Number.isFinite(quantities[i]) ? quantities[i] : 0,
      unit_price: Number.isFinite(prices[i]) ? prices[i] : 0,
    }))
    .filter((l) => l.description && l.quantity > 0);
}

/* ------------------------------------------------------------- the account */

export async function saveDeposit(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "deposit.manage")) return { error: "You cannot open or edit a deposit account." };

  const id = Number(str(fd, "id")) || null;
  const companyId = Number(str(fd, "company_id")) || null;
  const name = str(fd, "name");
  if (!companyId) return { error: "Choose the customer this deposit belongs to." };
  if (!name) return { error: "Give the account a name — what the money is for." };

  const ratio = Number(str(fd, "low_balance_percent") || "10") / 100;
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
    return { error: "The low-balance warning must be between 0 and 100 percent." };

  const owner = Number(str(fd, "owner_id")) || null;
  const notes = str(fd, "notes") || null;
  const currency = str(fd, "currency") || "NGN";

  if (id) {
    const existing = await getDeposit(me, id);
    if (!existing) return { error: "That deposit account is not yours to edit." };
    await sql`
      update crm_deposits
         set name = ${name}, currency = ${currency}, owner_id = ${owner}, notes = ${notes},
             low_balance_ratio = ${ratio}, status = ${str(fd, "status") || "active"}
       where id = ${id}`;
    await audit(me.id, "deposit.update", "deposit", id, { name });
    revalidatePath(`/deposits/${id}`);
    revalidatePath("/deposits");
    return { ok: true };
  }

  const [row] = await sql<{ id: number; ref: string }>`
    insert into crm_deposits (company_id, name, currency, owner_id, notes, low_balance_ratio, created_by)
    values (${companyId}, ${name}, ${currency}, ${owner ?? me.id}, ${notes}, ${ratio}, ${me.id})
    returning id, ref`;

  // Opening funding is optional here: an account can be opened before the money
  // lands, which is what happens when the paperwork arrives first.
  const opening = num(fd, "opening_amount");
  if (Number.isFinite(opening) && opening > 0) {
    await sql`
      insert into crm_deposit_entries (deposit_id, kind, amount, occurred_on, description, reference, recorded_by)
      values (${row.id}, 'funding', ${round2(opening)}, ${str(fd, "opening_date") || new Date().toISOString().slice(0, 10)},
              ${str(fd, "opening_description") || "Opening funding"}, ${str(fd, "opening_reference") || null}, ${me.id})`;
  }

  await audit(me.id, "deposit.open", "deposit", row.id, { company: companyId, name, opening });
  revalidatePath("/deposits");
  redirect(`/deposits/${row.id}`);
}

/* -------------------------------------------------------------- the ledger */

/**
 * Money received from the customer.
 */
export async function recordFunding(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "deposit.manage")) return { error: "You cannot record funding." };

  const depositId = Number(str(fd, "deposit_id"));
  const deposit = await getDeposit(me, depositId);
  if (!deposit) return { error: "That deposit account is not yours." };
  if (deposit.status === "closed") return { error: "This account is closed. Reopen it before posting to it." };

  const amount = num(fd, "amount");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount received." };

  let attachmentId: number | null = null;
  try {
    attachmentId = await saveUpload(fd.get("attachment"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const [entry] = await sql<{ id: string; ref: string }>`
    insert into crm_deposit_entries (deposit_id, kind, amount, occurred_on, description, reference, attachment_id, recorded_by)
    values (${depositId}, 'funding', ${round2(amount)},
            ${str(fd, "occurred_on") || new Date().toISOString().slice(0, 10)},
            ${str(fd, "description") || "Funding received"}, ${str(fd, "reference") || null},
            ${attachmentId}, ${me.id})
    returning id, ref`;

  await audit(me.id, "deposit.funding", "deposit", depositId, { entry: entry.ref, amount });
  await notify(
    [deposit.owner_id],
    `Funding received: ${deposit.company}`,
    `${money(amount, deposit.currency)} into ${deposit.ref} — ${deposit.name}`,
    `/deposits/${depositId}`,
    { kind: "deposit", entity: "deposit", entityId: depositId, actionLabel: "Open the account" },
  );

  revalidatePath(`/deposits/${depositId}`);
  revalidatePath("/deposits");
  return { ok: true, message: `${money(amount, deposit.currency)} recorded.` };
}

/**
 * Goods supplied against the deposit.
 *
 * This is the drawdown the customer's request produces, and the one place the
 * "until the money is over" rule lives: the balance is read inside the same
 * statement that writes the entry, so two people recording drawdowns at the
 * same moment cannot both be told there was enough.
 */
export async function recordDrawdown(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "deposit.manage")) return { error: "You cannot record a drawdown." };

  const depositId = Number(str(fd, "deposit_id"));
  const deposit = await getDeposit(me, depositId);
  if (!deposit) return { error: "That deposit account is not yours." };
  if (deposit.status === "closed") return { error: "This account is closed. Reopen it before posting to it." };

  const lines = linesFrom(fd);
  const typed = num(fd, "amount");
  // Itemised drawdowns are the normal case and the total is theirs to compute;
  // a single figure is still allowed for something that has no schedule.
  const amount = lines.length ? round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)) : round2(typed);
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: lines.length ? "Those lines come to nothing. Check the quantities and prices." : "Enter what this drawdown is worth." };

  const description = str(fd, "description");
  if (!description && !lines.length) return { error: "Say what was supplied." };

  let attachmentId: number | null = null;
  try {
    attachmentId = await saveUpload(fd.get("attachment"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  /**
   * Write the entry only if the balance can stand it.
   *
   * The insert's own `select` recomputes the balance from the ledger as it
   * commits, so this is not a read-then-write that a second drawdown can slip
   * between. No rows inserted means there was not enough.
   */
  const [entry] = await sql<{ id: string; ref: string }>`
    insert into crm_deposit_entries (deposit_id, kind, amount, occurred_on, description, reference, attachment_id, recorded_by)
    select ${depositId}, 'drawdown', ${-amount},
           ${str(fd, "occurred_on") || new Date().toISOString().slice(0, 10)},
           ${description || "Goods supplied"}, ${str(fd, "reference") || null}, ${attachmentId}, ${me.id}
     where (select coalesce(sum(amount), 0) from crm_deposit_entries where deposit_id = ${depositId}) >= ${amount}
    returning id, ref`;

  if (!entry) {
    const balance = Number(deposit.balance);
    return {
      error:
        `There is only ${money(balance, deposit.currency)} left on ${deposit.ref}, and this drawdown is ` +
        `${money(amount, deposit.currency)}. Record further funding first, or reduce the quantities.`,
    };
  }

  for (const line of lines) {
    await sql`
      insert into crm_deposit_items (entry_id, description, quantity, unit_price, line_total)
      values (${Number(entry.id)}, ${line.description}, ${line.quantity}, ${line.unit_price},
              ${round2(line.quantity * line.unit_price)})`;
  }

  await audit(me.id, "deposit.drawdown", "deposit", depositId, {
    entry: entry.ref,
    amount,
    lines: lines.length,
  });

  await announceBalance(depositId, me.id);

  revalidatePath(`/deposits/${depositId}`);
  revalidatePath("/deposits");
  return { ok: true, message: `${money(amount, deposit.currency)} drawn down.` };
}

/** A refund out, or a correction either way. Deliberately a higher bar. */
export async function adjustDeposit(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "deposit.adjust")) return { error: "Only finance or the MD can adjust a deposit ledger." };

  const depositId = Number(str(fd, "deposit_id"));
  const deposit = await getDeposit(me, depositId);
  if (!deposit) return { error: "That deposit account is not yours." };

  const kind = str(fd, "kind");
  if (!["refund", "adjustment"].includes(kind)) return { error: "Choose a refund or an adjustment." };

  const magnitude = num(fd, "amount");
  if (!Number.isFinite(magnitude) || magnitude === 0) return { error: "Enter the amount." };
  const description = str(fd, "description");
  if (!description) return { error: "An adjustment without a reason is not worth having. Say why." };

  // A refund always leaves the account; an adjustment goes whichever way the
  // person chose, because a correction can be in either direction.
  const signed =
    kind === "refund" ? -Math.abs(round2(magnitude)) : round2(str(fd, "direction") === "out" ? -Math.abs(magnitude) : Math.abs(magnitude));

  const [entry] = await sql<{ id: string; ref: string }>`
    insert into crm_deposit_entries (deposit_id, kind, amount, occurred_on, description, reference, recorded_by)
    select ${depositId}, ${kind}, ${signed},
           ${str(fd, "occurred_on") || new Date().toISOString().slice(0, 10)},
           ${description}, ${str(fd, "reference") || null}, ${me.id}
     where ${signed} > 0
        or (select coalesce(sum(amount), 0) from crm_deposit_entries where deposit_id = ${depositId}) >= ${Math.abs(signed)}
    returning id, ref`;

  if (!entry)
    return {
      error: `There is only ${money(Number(deposit.balance), deposit.currency)} left on ${deposit.ref}. That would take it below zero.`,
    };

  await audit(me.id, `deposit.${kind}`, "deposit", depositId, { entry: entry.ref, amount: signed, description });
  await announceBalance(depositId, me.id);
  revalidatePath(`/deposits/${depositId}`);
  revalidatePath("/deposits");
  return { ok: true, message: "Recorded." };
}

/**
 * Tells the people who care when an account is running dry or has run out.
 *
 * Only on the crossing, not on every drawdown: an account that is already empty
 * should not send a message every time somebody tries to use it.
 */
async function announceBalance(depositId: number, actorId: number) {
  const [row] = await sql<{
    ref: string; name: string; company: string; currency: string; owner_id: number | null;
    funded: string; balance: string; low_balance_ratio: string; prior: string;
  }>`
    select d.ref, d.name, c.name as company, d.currency, d.owner_id,
           b.funded, b.balance, d.low_balance_ratio,
           -- The balance as it stood before the newest entry.
           (b.balance - coalesce((select e.amount from crm_deposit_entries e
                                   where e.deposit_id = d.id order by e.id desc limit 1), 0)) as prior
      from crm_deposits d
      join crm_companies c on c.id = d.company_id
      join crm_deposit_balances b on b.deposit_id = d.id
     where d.id = ${depositId}`;
  if (!row) return;

  const funded = Number(row.funded);
  const balance = Number(row.balance);
  const prior = Number(row.prior);
  const threshold = funded * Number(row.low_balance_ratio);

  const justEmptied = balance <= 0 && prior > 0;
  const justLow = balance > 0 && balance <= threshold && prior > threshold;
  if (!justEmptied && !justLow) return;

  const watchers = await usersWithCapability("deposit.view");
  const audience = [...new Set([row.owner_id, ...watchers.map((w) => w.id)])].filter(
    (id): id is number => !!id && id !== actorId,
  );

  await notify(
    audience,
    justEmptied ? `Deposit exhausted: ${row.company}` : `Deposit running low: ${row.company}`,
    justEmptied
      ? `${row.ref} — ${row.name} has no funds left. Further requests need new funding.`
      : `${row.ref} — ${row.name} is down to ${money(balance, row.currency)} of ${money(funded, row.currency)}.`,
    `/deposits/${depositId}`,
    {
      kind: "deposit",
      entity: "deposit",
      entityId: depositId,
      actionLabel: "Open the account",
      emailBody: `<p>Remaining: <strong>${money(balance, row.currency)}</strong> of ${money(funded, row.currency)} funded (${Math.round(
        remainingRatio(funded, balance) * 100,
      )}%).</p>`,
    },
  );
}

/** Removes an entry that should never have been posted. Append-only in spirit, so it is audited loudly. */
export async function deleteDepositEntry(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "deposit.adjust")) return { error: "Only finance or the MD can remove a ledger entry." };
  const id = Number(str(fd, "id"));

  const [entry] = await sql<{ deposit_id: number; ref: string; kind: string; amount: string; description: string }>`
    delete from crm_deposit_entries where id = ${id}
    returning deposit_id, ref, kind, amount, description`;
  if (!entry) return { error: "That entry no longer exists." };

  await audit(me.id, "deposit.entry_delete", "deposit", entry.deposit_id, {
    entry: entry.ref,
    kind: entry.kind,
    amount: entry.amount,
    description: entry.description,
  });
  revalidatePath(`/deposits/${entry.deposit_id}`);
  revalidatePath("/deposits");
  return { ok: true, message: `${entry.ref} removed.` };
}
