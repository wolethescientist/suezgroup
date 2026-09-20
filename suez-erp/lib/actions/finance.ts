"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireCap, requireUser } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { nextRef } from "@/lib/refs";
import { DUAL_APPROVAL_THRESHOLD, isSelfApproval, SELF_APPROVAL_MESSAGE } from "@/lib/permissions";
import { saveUpload } from "@/lib/attachments";
import { documentTotals, outstanding } from "@/lib/money";
import { money } from "@/lib/format";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => Number(str(fd, k) || 0);

/* --------------------------------------------------------------- invoices */

/**
 * Lines arrive as parallel arrays (`line_desc[]`, `line_qty[]`, `line_price[]`)
 * because the composer adds rows client-side without a round trip.
 */
function readLines(fd: FormData) {
  const desc = fd.getAll("line_desc").map((v) => v.toString().trim());
  const qty = fd.getAll("line_qty").map((v) => Number(v.toString() || 0));
  const price = fd.getAll("line_price").map((v) => Number(v.toString() || 0));
  return desc
    .map((d, i) => ({ description: d, quantity: qty[i] || 0, unit_price: price[i] || 0 }))
    .filter((l) => l.description && l.quantity > 0);
}

export async function createInvoice(fd: FormData) {
  const me = await requireCap("invoice.manage");
  const lines = readLines(fd);
  if (!lines.length) return { error: "Add at least one line with a description and a quantity." };

  const t = documentTotals(lines, { taxRate: num(fd, "tax_rate") });
  const ref = await nextRef(str(fd, "kind") === "purchase" ? "PINV" : "INV");

  const [inv] = await sql<{ id: number }>`
    insert into invoices (ref, kind, customer_id, vendor_id, po_id, project_id, issue_date, due_date,
                          currency, subtotal, tax_rate, tax_amount, total, notes, created_by)
    values (${ref}, ${str(fd, "kind") || "sales"},
            ${Number(str(fd, "customer_id")) || null}, ${Number(str(fd, "vendor_id")) || null},
            ${Number(str(fd, "po_id")) || null},
            ${Number(str(fd, "project_id")) || null},
            ${str(fd, "issue_date") || new Date().toISOString().slice(0, 10)},
            ${str(fd, "due_date") || null}, ${str(fd, "currency") || "NGN"},
            ${t.subtotal}, ${t.taxRate}, ${t.tax}, ${t.total}, ${str(fd, "notes") || null}, ${me.id})
    returning id`;

  for (const l of lines) {
    await sql`
      insert into invoice_lines (invoice_id, description, quantity, unit_price, line_total)
      values (${inv.id}, ${l.description}, ${l.quantity}, ${l.unit_price}, ${l.quantity * l.unit_price})`;
  }

  await audit(me.id, "invoice.create", "invoice", inv.id, { ref, total: t.total });
  revalidatePath("/finance/invoices");
  redirect(`/finance/invoices/${inv.id}`);
}

export async function setInvoiceStatus(fd: FormData) {
  const me = await requireCap("invoice.manage");
  const id = Number(str(fd, "id"));
  const status = str(fd, "status");
  if (!["draft", "sent", "paid", "void"].includes(status)) return { error: "Unknown status." };
  await sql`update invoices set status = ${status} where id = ${id}`;
  await audit(me.id, "invoice.status", "invoice", id, { status });
  revalidatePath(`/finance/invoices/${id}`);
  revalidatePath("/finance/invoices");
  return { ok: true };
}

/**
 * Records a payment and re-derives the invoice status from the total paid, so
 * `part_paid`/`paid` can never disagree with the payments table.
 */
export async function recordPayment(fd: FormData) {
  const me = await requireCap("invoice.manage");
  const id = Number(str(fd, "invoice_id"));
  const amount = num(fd, "amount");
  if (amount <= 0) return { error: "Enter an amount greater than zero." };

  const [inv] = await sql<{ total: string; amount_paid: string; status: string; kind: string; currency: string }>`
    select total, amount_paid, status, kind, currency from invoices where id = ${id}`;
  if (!inv) return { error: "That invoice no longer exists." };
  // Money should not be receipted against a document that was never issued.
  if (inv.status === "draft")
    return {
      error: inv.kind === "sales"
        ? "Send the invoice to the client before recording a payment against it."
        : "Mark the supplier invoice as received before recording a payment against it.",
    };
  if (inv.status === "void") return { error: "That invoice has been voided." };
  const due = outstanding(Number(inv.total), Number(inv.amount_paid));
  if (amount > due) return { error: `That is more than the ${money(due, inv.currency)} still outstanding.` };

  await sql`
    insert into payments (invoice_id, amount, paid_on, method, reference, recorded_by)
    values (${id}, ${amount}, ${str(fd, "paid_on") || new Date().toISOString().slice(0, 10)},
            ${str(fd, "method") || "transfer"}, ${str(fd, "reference") || null}, ${me.id})`;

  await sql`
    update invoices i
       set amount_paid = p.total,
           status = case when p.total >= i.total then 'paid'
                         when p.total > 0 then 'part_paid'
                         else i.status end
      from (select coalesce(sum(amount), 0) as total from payments where invoice_id = ${id}) p
     where i.id = ${id}`;

  await audit(me.id, "invoice.payment", "invoice", id, { amount });
  revalidatePath(`/finance/invoices/${id}`);
  revalidatePath("/finance/invoices");
  return { ok: true, message: "Payment recorded." };
}

/* --------------------------------------------------------------- expenses */

export async function claimExpense(fd: FormData) {
  const me = await requireUser();
  const amount = num(fd, "amount");
  const description = str(fd, "description");
  if (!description) return { error: "Describe what the expense was for." };
  if (amount <= 0) return { error: "Enter an amount greater than zero." };

  let receiptId: number | null = null;
  try {
    receiptId = await saveUpload(fd.get("receipt"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  // The expense circular asks for original receipts on the larger claims, so
  // the form does too rather than leaving it to whoever approves.
  if (amount > DUAL_APPROVAL_THRESHOLD && !receiptId)
    return {
      error: `A claim over ${money(DUAL_APPROVAL_THRESHOLD)} must have its receipt attached.`,
    };

  const ref = await nextRef("EXP");
  const [row] = await sql<{ id: number }>`
    insert into expenses (ref, user_id, project_id, category, description, amount, currency, spent_on, receipt_id)
    values (${ref}, ${me.id}, ${Number(str(fd, "project_id")) || null}, ${str(fd, "category") || "other"},
            ${description}, ${amount}, ${str(fd, "currency") || "NGN"},
            ${str(fd, "spent_on") || new Date().toISOString().slice(0, 10)}, ${receiptId})
    returning id`;

  const approvers = await sql<{ id: number }>`
    select id from users where role in ('admin','finance') and id <> ${me.id}`;
  await notify(
    approvers.map((a) => a.id),
    "Expense claim raised",
    `${me.full_name} claimed ${money(amount)} — ${description}`,
    `/finance/expenses/${row.id}`,
  );
  await audit(me.id, "expense.claim", "expense", row.id, { ref, amount });
  revalidatePath("/finance/expenses");
  redirect(`/finance/expenses/${row.id}`);
}

/**
 * Decide an expense claim.
 *
 * Two controls the old version did not have:
 *  - the claimant is never an approver, at any rank (that part was already here);
 *  - above the threshold a SECOND, different approver is required, which is what
 *    the company's expense circular has always said and the system could not do.
 * Reimbursement is a payment, so it is only reachable once the claim is approved
 * — previously a pending claim could be marked reimbursed and skip approval.
 */
export async function decideExpense(fd: FormData) {
  const me = await requireCap("expense.approve");
  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision");
  if (!["approved", "rejected", "reimbursed"].includes(decision)) return { error: "Unknown decision." };

  const [exp] = await sql<{
    user_id: number; ref: string; status: string; amount: string;
    approver_id: number | null; receipt_id: number | null;
  }>`
    select user_id, ref, status, amount, approver_id, receipt_id from expenses where id = ${id}`;
  if (!exp) return { error: "That claim no longer exists." };
  if (exp.status === "reimbursed") return { error: "That claim has already been reimbursed." };
  if (exp.status === "rejected") return { error: "That claim was rejected. The claimant must raise a new one." };
  // Segregation of duties: the claimant is never the approver, however senior.
  if (isSelfApproval(me, exp.user_id)) return { error: SELF_APPROVAL_MESSAGE };

  const amount = Number(exp.amount);
  const needsTwo = amount > DUAL_APPROVAL_THRESHOLD;
  const note = str(fd, "note") || null;

  if (decision === "reimbursed") {
    if (exp.status !== "approved")
      return { error: "Only an approved claim can be marked reimbursed." };
    await sql`
      update expenses set status = 'reimbursed', decision_note = coalesce(${note}, decision_note)
       where id = ${id}`;
    await notify([exp.user_id], `Expense ${exp.ref} reimbursed`, note, `/finance/expenses/${id}`);
    await audit(me.id, "expense.reimbursed", "expense", id, { amount });
    revalidatePath(`/finance/expenses/${id}`);
    revalidatePath("/finance/expenses");
    return { ok: true };
  }

  if (decision === "rejected") {
    await sql`
      update expenses set status = 'rejected', approver_id = ${me.id}, decided_at = now(),
                          decision_note = ${note}
       where id = ${id}`;
    await notify([exp.user_id], `Expense ${exp.ref} rejected`, note, `/finance/expenses/${id}`);
    await audit(me.id, "expense.rejected", "expense", id);
    revalidatePath(`/finance/expenses/${id}`);
    revalidatePath("/finance/expenses");
    return { ok: true };
  }

  // decision === "approved"
  if (needsTwo && exp.status === "pending") {
    if (!exp.receipt_id)
      return { error: `A claim over ${money(DUAL_APPROVAL_THRESHOLD)} needs its receipt attached before approval.` };
    await sql`
      update expenses set status = 'awaiting_second', approver_id = ${me.id}, decided_at = now(),
                          decision_note = ${note}
       where id = ${id}`;
    const others = await sql<{ id: number }>`
      select id from users where role in ('admin','finance') and id <> ${me.id} and id <> ${exp.user_id}`;
    await notify(
      others.map((o) => o.id),
      `Second approval needed — ${exp.ref}`,
      `${money(amount)} is over the ${money(DUAL_APPROVAL_THRESHOLD)} threshold and needs a second approver.`,
      `/finance/expenses/${id}`,
    );
    await notify([exp.user_id], `Expense ${exp.ref} passed first approval`, "Waiting on a second approver.", `/finance/expenses/${id}`);
    await audit(me.id, "expense.approved.first", "expense", id, { amount });
    revalidatePath(`/finance/expenses/${id}`);
    revalidatePath("/finance/expenses");
    return { ok: true, message: "First approval recorded. A second approver must now sign off." };
  }

  if (exp.status === "awaiting_second" && exp.approver_id === me.id)
    return { error: "You gave the first approval. A different approver must give the second." };

  // Work out the countersignature in JS: a CASE whose branches are all
  // parameters gives Postgres nothing to infer the column type from.
  const secondApprover = exp.status === "awaiting_second" ? me.id : null;
  await sql`
    update expenses set status = 'approved',
                        approver_id = coalesce(approver_id, ${me.id}),
                        second_approver_id = ${secondApprover},
                        second_decided_at = ${secondApprover ? new Date() : null},
                        decided_at = coalesce(decided_at, now()),
                        decision_note = coalesce(${note}, decision_note)
   where id = ${id}`;
  await notify([exp.user_id], `Expense ${exp.ref} approved`, note, `/finance/expenses/${id}`);
  await audit(me.id, "expense.approved", "expense", id, { amount });
  revalidatePath(`/finance/expenses/${id}`);
  revalidatePath("/finance/expenses");
  return { ok: true };
}

/* -------------------------------------------------------------- customers */

/**
 * The clients the company invoices.
 *
 * ponytail: `customers` was read in six places — invoice creation, the invoice
 * list and detail, project creation, the dashboard and global search — and
 * there was no screen anywhere to create one. The dropdown on "Raise an
 * invoice" said "None" and a sales invoice could never name who it billed. The
 * only way in was a spreadsheet import.
 */
export async function saveCustomer(fd: FormData) {
  const me = await requireCap("customer.manage");
  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  if (!name) return { error: "The client needs a name." };

  const [dupe] = await sql<{ id: number }>`
    select id from customers where lower(name) = lower(${name}) and (${id}::int is null or id <> ${id})`;
  if (dupe) return { error: `${name} is already on the client list.` };

  if (id) {
    await sql`
      update customers set name = ${name},
                           email = ${str(fd, "email") || null}, phone = ${str(fd, "phone") || null},
                           address = ${str(fd, "address") || null}, tax_id = ${str(fd, "tax_id") || null},
                           status = ${str(fd, "status") || "active"}
       where id = ${id}`;
    await audit(me.id, "customer.update", "customer", id, { name });
  } else {
    const [row] = await sql<{ id: number }>`
      insert into customers (name, email, phone, address, tax_id, status)
      values (${name}, ${str(fd, "email") || null},
              ${str(fd, "phone") || null}, ${str(fd, "address") || null}, ${str(fd, "tax_id") || null},
              ${str(fd, "status") || "active"})
      returning id`;
    await audit(me.id, "customer.create", "customer", row.id, { name });
  }
  revalidatePath("/finance/customers");
  revalidatePath("/finance/invoices");
  return { ok: true };
}

export async function deleteCustomer(fd: FormData) {
  const me = await requireCap("customer.manage");
  const id = Number(str(fd, "id"));
  const [{ n }] = await sql<{ n: number }>`select count(*)::int as n from invoices where customer_id = ${id}`;
  if (n > 0)
    return { error: `That client has ${n} invoice(s) against them. Set them to closed instead of deleting.` };
  await sql`delete from customers where id = ${id}`;
  await audit(me.id, "customer.delete", "customer", id);
  revalidatePath("/finance/customers");
  return { ok: true };
}

/* ---------------------------------------------------------------- budgets */

export async function saveBudget(fd: FormData) {
  const me = await requireCap("budget.manage");
  const allocated = num(fd, "allocated");
  const year = Number(str(fd, "fiscal_year")) || new Date().getFullYear();
  if (allocated <= 0) return { error: "Enter an allocation greater than zero." };

  await sql`
    insert into budgets (department_id, project_id, fiscal_year, category, allocated, currency, notes)
    values (${Number(str(fd, "department_id")) || null}, ${Number(str(fd, "project_id")) || null},
            ${year}, ${str(fd, "category") || "operating"}, ${allocated},
            ${str(fd, "currency") || "NGN"}, ${str(fd, "notes") || null})`;
  await audit(me.id, "budget.create", "budget", undefined, { year, allocated });
  revalidatePath("/finance/budgets");
  return { ok: true };
}

export async function deleteBudget(fd: FormData) {
  const me = await requireCap("budget.manage");
  const id = Number(str(fd, "id"));
  await sql`delete from budgets where id = ${id}`;
  await audit(me.id, "budget.delete", "budget", id);
  revalidatePath("/finance/budgets");
  return { ok: true };
}
