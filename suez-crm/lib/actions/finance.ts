"use server";

import { revalidatePath } from "next/cache";
import { requireCap, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nextRef } from "@/lib/refs";
import { documentTotals, outstanding, paymentStatus } from "@/lib/money";

const str = (fd: FormData, key: string) => (fd.get(key) ?? "").toString().trim();
const num = (fd: FormData, key: string) => Number(str(fd, key) || 0);

export async function createFinanceInvoice(fd: FormData) {
  const me = await requireCap("invoice.manage");
  const description = str(fd, "description"); const quantity = num(fd, "quantity"); const unitPrice = num(fd, "unit_price");
  if (!description || quantity <= 0 || unitPrice < 0) return { error: "Add a description, a quantity, and a valid unit price." };
  const totals = documentTotals([{ quantity, unit_price: unitPrice }], { taxRate: num(fd, "tax_rate") || 7.5 });
  const ref = await nextRef("INV");
  const [invoice] = await sql<{id:number}>`
    insert into crm_finance_invoices (ref,company_id,issue_date,due_date,currency,subtotal,tax_rate,tax_amount,total,notes,created_by)
    values (${ref},${Number(str(fd,"company_id"))||null},${str(fd,"issue_date")||new Date().toISOString().slice(0,10)},${str(fd,"due_date")||null},${str(fd,"currency")||"NGN"},${totals.subtotal},${totals.taxRate},${totals.tax},${totals.total},${str(fd,"notes")||null},${me.id}) returning id`;
  await audit(me.id,"finance.invoice.create","finance_invoice",invoice.id,{ref,total:totals.total});
  revalidatePath("/finance"); revalidatePath("/finance/invoices");
  return { ok:true, message:`Invoice ${ref} created.` };
}

export async function recordFinancePayment(fd: FormData) {
  const me = await requireCap("invoice.manage"); const invoiceId=Number(str(fd,"invoice_id")); const amount=num(fd,"amount");
  const [invoice]=await sql<{total:string;amount_paid:string;status:string}>`select total,amount_paid,status from crm_finance_invoices where id=${invoiceId}`;
  if(!invoice || amount<=0) return {error:"Enter a valid payment amount."};
  if(invoice.status === "draft" || invoice.status === "void") return {error:"Send the invoice before recording a payment."};
  if(amount > outstanding(Number(invoice.total),Number(invoice.amount_paid))) return {error:"That is more than the outstanding balance."};
  await sql`insert into crm_finance_payments (invoice_id,amount,paid_on,method,reference,recorded_by) values (${invoiceId},${amount},${str(fd,"paid_on")||new Date().toISOString().slice(0,10)},${str(fd,"method")||"transfer"},${str(fd,"reference")||null},${me.id})`;
  const [sum]=await sql<{total:string}>`select coalesce(sum(amount),0) as total from crm_finance_payments where invoice_id=${invoiceId}`;
  await sql`update crm_finance_invoices set amount_paid=${sum.total},status=${paymentStatus(Number(invoice.total),Number(sum.total),invoice.status)} where id=${invoiceId}`;
  await audit(me.id,"finance.invoice.payment","finance_invoice",invoiceId,{amount}); revalidatePath("/finance"); revalidatePath("/finance/invoices"); return {ok:true};
}

export async function setFinanceInvoiceStatus(fd: FormData) {
  const me=await requireCap("invoice.manage"); const id=Number(str(fd,"id")); const status=str(fd,"status");
  if(!["draft","sent","void"].includes(status)) return {error:"Unknown invoice status."};
  await sql`update crm_finance_invoices set status=${status} where id=${id}`; await audit(me.id,"finance.invoice.status","finance_invoice",id,{status}); revalidatePath("/finance"); revalidatePath("/finance/invoices"); return {ok:true};
}

export async function claimFinanceExpense(fd: FormData) {
  const me=await requireUser(); const amount=num(fd,"amount"); const description=str(fd,"description");
  if(amount<=0 || !description) return {error:"Describe the expense and enter a valid amount."}; const ref=await nextRef("EXP");
  await sql`insert into crm_finance_expenses (ref,user_id,category,description,amount,currency,spent_on) values (${ref},${me.id},${str(fd,"category")||"other"},${description},${amount},${str(fd,"currency")||"NGN"},${str(fd,"spent_on")||new Date().toISOString().slice(0,10)})`;
  await audit(me.id,"finance.expense.claim","finance_expense",ref,{amount}); revalidatePath("/finance"); revalidatePath("/finance/expenses"); return {ok:true,message:`Expense ${ref} submitted.`};
}

export async function decideFinanceExpense(fd: FormData) {
  const me=await requireCap("expense.approve"); const id=Number(str(fd,"id")); const status=str(fd,"status");
  if(!["approved","rejected","reimbursed"].includes(status)) return {error:"Unknown expense decision."};
  await sql`update crm_finance_expenses set status=${status},approver_id=${me.id},decision_note=${str(fd,"note")||null} where id=${id}`;
  await audit(me.id,"finance.expense.decide","finance_expense",id,{status}); revalidatePath("/finance"); revalidatePath("/finance/expenses"); return {ok:true};
}

export async function saveFinanceBudget(fd: FormData) {
  const me=await requireCap("budget.manage"); const name=str(fd,"name"); const allocated=num(fd,"allocated");
  if(!name || allocated<0) return {error:"Give the budget a name and valid amount."};
  await sql`insert into crm_finance_budgets (name,fiscal_year,category,allocated,currency,notes,created_by) values (${name},${Number(str(fd,"fiscal_year"))||new Date().getFullYear()},${str(fd,"category")||"operating"},${allocated},${str(fd,"currency")||"NGN"},${str(fd,"notes")||null},${me.id})`;
  await audit(me.id,"finance.budget.create","finance_budget",undefined,{name,allocated}); revalidatePath("/finance"); revalidatePath("/finance/budgets"); return {ok:true};
}
