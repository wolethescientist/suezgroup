"use client";

import { useState } from "react";
import { titleCase } from "@/lib/format";
import { ActionForm, Dialog, Select, SubmitBtn, type Action } from "@/components/form";
import { Field, Row } from "@/components/ui";
import { Icon } from "@/components/icons";

export type Opt = { id: number; label: string };

const opts = (list: Opt[]) => list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>);
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------- line editor */

/**
 * Adds and removes invoice/PO/quote lines client-side. Rows post as parallel
 * `line_desc`/`line_qty`/`line_price` arrays, which the action zips back up.
 */
export function LineEditor({ items }: { items?: Opt[] }) {
  const [rows, setRows] = useState([0]);
  const [tick, setTick] = useState(0);
  const total = () => {
    if (typeof document === "undefined") return 0;
    const qs = [...document.querySelectorAll<HTMLInputElement>('input[name="line_qty"]')];
    const ps = [...document.querySelectorAll<HTMLInputElement>('input[name="line_price"]')];
    return qs.reduce((s, q, i) => s + Number(q.value || 0) * Number(ps[i]?.value || 0), 0);
  };

  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs font-bold text-ink-soft">Lines</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r} className="flex flex-wrap items-end gap-2">
            {items && (
              <Select name="line_item" className="field w-32" defaultValue="">
                <option value="">No stock item</option>
                {opts(items)}
              </Select>
            )}
            <input name="line_desc" placeholder="Description" className="field min-w-40 flex-1" />
            <input name="line_qty" type="number" step="0.01" min="0" defaultValue="1" placeholder="Qty"
                   onChange={() => setTick(tick + 1)} className="field w-20" />
            <input name="line_price" type="number" step="0.01" min="0" defaultValue="0" placeholder="Unit price"
                   onChange={() => setTick(tick + 1)} className="field w-28" />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows(rows.filter((x) => x !== r))}
                      className="rounded-lg px-2 py-2 text-ink-soft hover:bg-canvas" aria-label="Remove line">×</button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => setRows([...rows, Math.max(...rows) + 1])}
                className="text-xs font-bold text-brand-700 hover:underline">+ Add line</button>
        <p className="text-xs font-bold text-ink-soft tabular">Subtotal {total().toLocaleString()}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- finance */

export function InvoiceForm({ action, companies, vendors, projects, orders = [] }: {
  action: Action; companies: Opt[]; vendors: Opt[]; projects: Opt[];
  /** Open purchase orders, so a supplier invoice can be matched to the order it settles. */
  orders?: Opt[];
}) {
  const [kind, setKind] = useState("sales");
  return (
    <Dialog label={<><Icon name="plus" /> New invoice</>} title="Raise an invoice" width="max-w-2xl">
      <ActionForm action={action} className="space-y-4">
        <Row>
          <Field label="Type">
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="field">
              <option value="sales">Sales — we invoice a client</option>
              <option value="purchase">Purchase — a vendor invoices us</option>
            </select>
          </Field>
          <Field label={kind === "sales" ? "Client" : "Vendor"}>
            {kind === "sales" ? (
              <Select name="customer_id" className="field" defaultValue=""><option value="">None</option>{opts(companies)}</Select>
            ) : (
              <Select name="vendor_id" className="field" defaultValue=""><option value="">None</option>{opts(vendors)}</Select>
            )}
          </Field>
        </Row>
        {kind === "purchase" && (
          <Field label="Against purchase order" hint="Matching the invoice to its order is what lets the two be reconciled.">
            <Select name="po_id" className="field" defaultValue="">
              <option value="">Not against an order</option>
              {opts(orders)}
            </Select>
          </Field>
        )}
        <Row>
          <Field label="Project"><Select name="project_id" className="field" defaultValue=""><option value="">None</option>{opts(projects)}</Select></Field>
          <Field label="Currency"><input name="currency" defaultValue="NGN" className="field" /></Field>
        </Row>
        <Row>
          <Field label="Issue date"><input name="issue_date" type="date" defaultValue={today()} className="field" /></Field>
          <Field label="Due date"><input name="due_date" type="date" className="field" /></Field>
        </Row>
        <Field label="VAT rate %" hint="Nigerian standard rate is 7.5%.">
          <input name="tax_rate" type="number" step="0.01" defaultValue="7.5" className="field" />
        </Field>
        <LineEditor />
        <Field label="Notes"><textarea name="notes" rows={2} className="field resize-y" /></Field>
        <SubmitBtn className="w-full">Create invoice</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function ExpenseForm({ action, projects }: { action: Action; projects: Opt[] }) {
  return (
    <Dialog label={<><Icon name="plus" /> Claim an expense</>} title="Expense claim">
      <ActionForm action={action} className="space-y-4">
        <Field label="What was it for"><input name="description" required className="field" placeholder="e.g. Taxi to client site, Ikoyi" /></Field>
        <Row>
          <Field label="Category">
            <Select name="category" className="field" defaultValue="travel">
              {["travel", "meals", "accommodation", "fuel", "supplies", "training", "other"].map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount"><input name="amount" type="number" step="0.01" min="0" required className="field" /></Field>
        </Row>
        <Row>
          <Field label="Date spent"><input name="spent_on" type="date" defaultValue={today()} className="field" /></Field>
          <Field label="Project"><Select name="project_id" className="field" defaultValue=""><option value="">None</option>{opts(projects)}</Select></Field>
        </Row>
        <Field label="Receipt" hint="A photo or PDF, up to 20 MB."><input name="receipt" type="file" className="field" /></Field>
        <SubmitBtn className="w-full">Submit claim</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/** The categories an expense can carry. Budgets match against exactly these. */
export const EXPENSE_CATEGORIES = ["travel", "meals", "accommodation", "fuel", "supplies", "training", "other"] as const;

export function BudgetForm({ action, departments, projects }: { action: Action; departments: Opt[]; projects: Opt[] }) {
  return (
    <Dialog label={<><Icon name="plus" /> Add allocation</>} title="Budget allocation">
      <ActionForm action={action} className="space-y-4">
        <Row>
          <Field label="Department"><Select name="department_id" className="field" defaultValue=""><option value="">Organisation-wide</option>{opts(departments)}</Select></Field>
          <Field label="Project"><Select name="project_id" className="field" defaultValue=""><option value="">None</option>{opts(projects)}</Select></Field>
        </Row>
        <Row>
          <Field label="Fiscal year"><input name="fiscal_year" type="number" defaultValue={new Date().getFullYear()} className="field" /></Field>
          {/*
            A free-text category never matched the expense categories it is meant
            to be measured against, so a "Client entertainment" allocation saw no
            spend at all. Same list on both sides, plus a whole-department option.
          */}
          <Field label="Category" hint="Leave as all categories for a general departmental pot.">
            <Select name="category" className="field" defaultValue="">
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </Select>
          </Field>
        </Row>
        <Field label="Amount allocated"><input name="allocated" type="number" step="0.01" min="0" required className="field" /></Field>
        <Field label="Notes"><textarea name="notes" rows={2} className="field resize-y" /></Field>
        <SubmitBtn className="w-full">Save allocation</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function PaymentForm({ action, invoiceId, outstanding }: { action: Action; invoiceId: number; outstanding: number }) {
  return (
    <Dialog label="Record payment" title="Record a payment" description={`${outstanding.toLocaleString()} still outstanding.`}>
      <ActionForm action={action} className="space-y-4">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <Row>
          <Field label="Amount"><input name="amount" type="number" step="0.01" min="0" max={outstanding} defaultValue={outstanding} required className="field" /></Field>
          <Field label="Date"><input name="paid_on" type="date" defaultValue={today()} className="field" /></Field>
        </Row>
        <Row>
          <Field label="Method">
            <Select name="method" className="field" defaultValue="transfer">
              {["transfer", "cash", "cheque", "card", "other"].map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Reference"><input name="reference" className="field" placeholder="Teller / txn no." /></Field>
        </Row>
        <SubmitBtn className="w-full">Record payment</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/* -------------------------------------------------------- announcements */

export function AnnouncementForm({ action, departments }: { action: Action; departments: Opt[] }) {
  const [audience, setAudience] = useState("all");
  return (
    <Dialog label={<><Icon name="plus" /> Post announcement</>} title="New announcement" width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        <Field label="Title"><input name="title" required className="field" placeholder="e.g. Office closed on Monday" /></Field>
        <Field label="Message"><textarea name="body" rows={6} required className="field resize-y" /></Field>
        <Row>
          <Field label="Category">
            <Select name="category" className="field" defaultValue="general">
              {["general", "policy", "event", "it", "hr", "safety"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select name="priority" className="field" defaultValue="normal">
              {["low", "normal", "high"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </Select>
          </Field>
        </Row>
        <Row>
          <Field label="Audience">
            <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className="field">
              <option value="all">Everyone</option>
              <option value="department">One department</option>
            </select>
          </Field>
          {audience === "department" ? (
            <Field label="Department"><select name="department_id" className="field">{opts(departments)}</select></Field>
          ) : (
            <Field label="Expires" hint="Leave blank to keep it up."><input name="expires_at" type="date" className="field" /></Field>
          )}
        </Row>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="pinned" className="h-4 w-4 rounded" /> Pin to the top of everyone's dashboard
        </label>
        <SubmitBtn className="w-full">Publish announcement</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/* -------------------------------------------------------------- projects */

export function ProjectForm({ action, users, departments, companies, project }: {
  action: Action; users: Opt[]; departments: Opt[]; companies: Opt[];
  project?: { id: number; name: string; status: string; manager_id: number | null; start_date: string | null; end_date: string | null; budget: string; description: string | null };
}) {
  return (
    <Dialog label={project ? "Edit" : <><Icon name="plus" /> New project</>} variant={project ? "ghost" : "primary"}
            title={project ? "Edit project" : "New project"} width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        {project && <input type="hidden" name="id" value={project.id} />}
        <Field label="Name"><input name="name" required defaultValue={project?.name} className="field" /></Field>
        {!project && (
          <Row>
            <Field label="Code" hint="Optional short reference."><input name="code" className="field" placeholder="e.g. SZ-2026-01" /></Field>
            <Field label="Customer"><Select name="customer_id" className="field" defaultValue=""><option value="">Internal</option>{opts(companies)}</Select></Field>
          </Row>
        )}
        <Row>
          <Field label="Manager"><Select name="manager_id" className="field" defaultValue={project?.manager_id ?? ""}>{opts(users)}</Select></Field>
          <Field label="Status">
            <Select name="status" className="field" defaultValue={project?.status ?? "planning"}>
              {["planning", "active", "on_hold", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </Field>
        </Row>
        {!project && <Field label="Department"><Select name="department_id" className="field" defaultValue="">{opts(departments)}</Select></Field>}
        <Row>
          <Field label="Start"><input name="start_date" type="date" defaultValue={project?.start_date ?? ""} className="field" /></Field>
          <Field label="End"><input name="end_date" type="date" defaultValue={project?.end_date ?? ""} className="field" /></Field>
        </Row>
        <Field label="Budget"><input name="budget" type="number" step="0.01" min="0" defaultValue={project?.budget ?? 0} className="field" /></Field>
        <Field label="Description"><textarea name="description" rows={3} defaultValue={project?.description ?? ""} className="field resize-y" /></Field>
        <SubmitBtn className="w-full">{project ? "Save changes" : "Create project"}</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function TaskForm({ action, projectId, users }: { action: Action; projectId: number; users: Opt[] }) {
  return (
    <Dialog label={<><Icon name="plus" /> Add task</>} title="New task" variant="soft">
      <ActionForm action={action} className="space-y-4">
        <input type="hidden" name="project_id" value={projectId} />
        <Field label="Title"><input name="title" required className="field" /></Field>
        <Row>
          <Field label="Assign to"><Select name="assignee_id" className="field" defaultValue=""><option value="">Nobody yet</option>{opts(users)}</Select></Field>
          <Field label="Priority">
            <Select name="priority" className="field" defaultValue="normal">
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </Row>
        <Row>
          <Field label="Due"><input name="due_date" type="date" className="field" /></Field>
          <Field label="Estimate (hours)"><input name="estimate_hours" type="number" step="0.5" min="0" className="field" /></Field>
        </Row>
        <Field label="Detail"><textarea name="description" rows={3} className="field resize-y" /></Field>
        <SubmitBtn className="w-full">Add task</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/* ------------------------------------------------------------ procurement */

/**
 * The clients the company invoices. Mirrors VendorForm on the buying side.
 *
 * ponytail: this carried Industry and Notes as well, which are things a CRM
 * knows about a company and not things an invoice needs. Keeping a second,
 * diverging copy of them beside the CRM's was the reason to drop them: the
 * record here is a bill-to and nothing more.
 */
export function CustomerForm({ action, customer }: {
  action: Action;
  customer?: { id: number; name: string; email: string | null; phone: string | null; address: string | null; tax_id: string | null; status: string };
}) {
  return (
    <Dialog label={customer ? "Edit" : <><Icon name="plus" /> Add client</>} variant={customer ? "ghost" : "primary"}
            title={customer ? "Edit client" : "New client"} width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        {customer && <input type="hidden" name="id" value={customer.id} />}
        <Field label="Registered name"><input name="name" required defaultValue={customer?.name} className="field" /></Field>
        <Row>
          <Field label="Email"><input name="email" type="email" defaultValue={customer?.email ?? ""} className="field" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={customer?.phone ?? ""} className="field" /></Field>
        </Row>
        <Field label="Address"><textarea name="address" rows={2} defaultValue={customer?.address ?? ""} className="field resize-y" /></Field>
        <Row>
          <Field label="Tax ID / RC number"><input name="tax_id" defaultValue={customer?.tax_id ?? ""} className="field" /></Field>
          <Field label="Status">
            <Select name="status" className="field" defaultValue={customer?.status ?? "active"}>
              <option value="active">Active</option>
              <option value="dormant">Dormant</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
        </Row>
        <SubmitBtn className="w-full">{customer ? "Save changes" : "Add client"}</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function VendorForm({ action, vendor }: {
  action: Action;
  vendor?: { id: number; name: string; category: string | null; email: string | null; phone: string | null; address: string | null; tax_id: string | null; bank_details: string | null; rating: number | null; status: string; notes: string | null };
}) {
  return (
    <Dialog label={vendor ? "Edit" : <><Icon name="plus" /> Add vendor</>} variant={vendor ? "ghost" : "primary"}
            title={vendor ? "Edit vendor" : "New vendor"} width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        {vendor && <input type="hidden" name="id" value={vendor.id} />}
        <Row>
          <Field label="Name"><input name="name" required defaultValue={vendor?.name} className="field" /></Field>
          <Field label="Category"><input name="category" defaultValue={vendor?.category ?? ""} className="field" placeholder="e.g. IT hardware" /></Field>
        </Row>
        <Row>
          <Field label="Email"><input name="email" type="email" defaultValue={vendor?.email ?? ""} className="field" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={vendor?.phone ?? ""} className="field" /></Field>
        </Row>
        <Field label="Address"><textarea name="address" rows={2} defaultValue={vendor?.address ?? ""} className="field resize-y" /></Field>
        <Row>
          <Field label="Tax ID / RC number"><input name="tax_id" defaultValue={vendor?.tax_id ?? ""} className="field" /></Field>
          <Field label="Rating"><Select name="rating" className="field" defaultValue={vendor?.rating ?? ""}><option value="">Not rated</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} star{n>1?"s":""}</option>)}</Select></Field>
        </Row>
        <Field label="Bank details"><textarea name="bank_details" rows={2} defaultValue={vendor?.bank_details ?? ""} className="field resize-y" /></Field>
        <Row>
          <Field label="Status">
            <Select name="status" className="field" defaultValue={vendor?.status ?? "active"}>
              {["active", "suspended", "blacklisted"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Notes"><input name="notes" defaultValue={vendor?.notes ?? ""} className="field" /></Field>
        </Row>
        <SubmitBtn className="w-full">{vendor ? "Save changes" : "Add vendor"}</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function RequisitionForm({ action, projects }: { action: Action; projects: Opt[] }) {
  return (
    <Dialog label={<><Icon name="plus" /> Raise requisition</>} title="Purchase requisition" width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        <Field label="What is needed"><input name="title" required className="field" placeholder="e.g. 12 laptops for the field team" /></Field>
        <Field label="Justification"><textarea name="justification" rows={4} className="field resize-y" placeholder="Why it is needed and what happens without it." /></Field>
        <Row>
          <Field label="Estimated cost"><input name="estimated_cost" type="number" step="0.01" min="0" className="field" /></Field>
          <Field label="Needed by"><input name="needed_by" type="date" className="field" /></Field>
        </Row>
        <Field label="Project"><Select name="project_id" className="field" defaultValue=""><option value="">None</option>{opts(projects)}</Select></Field>
        <SubmitBtn className="w-full">Raise requisition</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function PurchaseOrderForm({ action, vendors, items, requisitionId }: {
  action: Action; vendors: Opt[]; items: Opt[]; requisitionId?: number;
}) {
  return (
    <Dialog label={<><Icon name="plus" /> Raise purchase order</>} title="Purchase order" width="max-w-2xl">
      <ActionForm action={action} className="space-y-4">
        {requisitionId && <input type="hidden" name="requisition_id" value={requisitionId} />}
        <Row>
          <Field label="Vendor"><select name="vendor_id" required className="field">{opts(vendors)}</select></Field>
          <Field label="Currency"><input name="currency" defaultValue="NGN" className="field" /></Field>
        </Row>
        <Row>
          <Field label="Order date"><input name="order_date" type="date" defaultValue={today()} className="field" /></Field>
          <Field label="Expected delivery"><input name="expected_date" type="date" className="field" /></Field>
        </Row>
        <LineEditor items={items} />
        <Field label="Notes"><textarea name="notes" rows={2} className="field resize-y" /></Field>
        <SubmitBtn className="w-full">Create purchase order</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/* -------------------------------------------------------------- inventory */

export function ItemForm({ action, warehouses, item }: {
  action: Action; warehouses: Opt[];
  item?: { id: number; sku: string; name: string; category: string | null; unit: string; reorder_level: string; unit_cost: string; warehouse_id: number | null; status: string };
}) {
  return (
    <Dialog label={item ? "Edit" : <><Icon name="plus" /> Add item</>} variant={item ? "ghost" : "primary"}
            title={item ? "Edit item" : "New stock item"}>
      <ActionForm action={action} className="space-y-4">
        {item && <input type="hidden" name="id" value={item.id} />}
        <Row>
          <Field label="SKU"><input name="sku" required defaultValue={item?.sku} className="field" /></Field>
          <Field label="Unit"><input name="unit" defaultValue={item?.unit ?? "each"} className="field" /></Field>
        </Row>
        <Field label="Name"><input name="name" required defaultValue={item?.name} className="field" /></Field>
        <Row>
          <Field label="Category"><input name="category" defaultValue={item?.category ?? ""} className="field" /></Field>
          <Field label="Location"><Select name="warehouse_id" className="field" defaultValue={item?.warehouse_id ?? ""}><option value="">Unassigned</option>{opts(warehouses)}</Select></Field>
        </Row>
        <Row>
          <Field label="Reorder level"><input name="reorder_level" type="number" step="0.01" min="0" defaultValue={item?.reorder_level ?? 0} className="field" /></Field>
          <Field label="Unit cost"><input name="unit_cost" type="number" step="0.01" min="0" defaultValue={item?.unit_cost ?? 0} className="field" /></Field>
        </Row>
        {!item && <Field label="Opening quantity"><input name="quantity" type="number" step="0.01" min="0" defaultValue="0" className="field" /></Field>}
        <SubmitBtn className="w-full">{item ? "Save changes" : "Add item"}</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function StockForm({ action, itemId, itemName, onHand }: { action: Action; itemId: number; itemName: string; onHand: number }) {
  return (
    <Dialog label="Move stock" variant="ghost" title={`Move stock — ${itemName}`} description={`${onHand} on hand.`}>
      <ActionForm action={action} className="space-y-4">
        <input type="hidden" name="item_id" value={itemId} />
        <Row>
          <Field label="Movement">
            {/*
              No default, and required.

              ponytail: this used to default to "Goods in". If the server rejected
              the submission — "Only 4.00 in stock" — the form was reset underneath
              the user, and someone who corrected just the quantity and submitted
              again silently recorded a goods RECEIPT where they meant an issue.
              A direction that decides whether stock goes up or down should never
              be assumed; make the person say it every time.
            */}
            <Select name="kind" className="field" required defaultValue="">
              <option value="">Choose…</option>
              <option value="in">Goods in</option>
              <option value="out">Goods out</option>
              <option value="adjust">Adjust to a counted figure</option>
            </Select>
          </Field>
          <Field label="Quantity"><input name="quantity" type="number" step="0.01" min="0" required className="field" /></Field>
        </Row>
        <Field label="Reason"><input name="reason" className="field" placeholder="e.g. Issued to site, stock count" /></Field>
        <Field label="Reference"><input name="reference" className="field" /></Field>
        <SubmitBtn className="w-full">Record movement</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/* ----------------------------------------------------------------- assets */

export function AssetForm({ action, vendors, asset }: {
  action: Action; vendors: Opt[];
  asset?: { id: number; tag: string; name: string; category: string; serial_no: string | null; purchase_date: string | null; purchase_cost: string; useful_life_years: number; vendor_id: number | null; location: string | null; status: string; notes: string | null };
}) {
  return (
    <Dialog label={asset ? "Edit" : <><Icon name="plus" /> Add asset</>} variant={asset ? "ghost" : "primary"}
            title={asset ? "Edit asset" : "New asset"} width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        {asset && <input type="hidden" name="id" value={asset.id} />}
        <Row>
          <Field label="Asset tag"><input name="tag" required defaultValue={asset?.tag} className="field" placeholder="e.g. SZ-IT-0042" /></Field>
          <Field label="Category">
            <Select name="category" className="field" defaultValue={asset?.category ?? "it"}>
              {["it", "furniture", "vehicle", "machinery", "building", "other"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </Row>
        <Field label="Name"><input name="name" required defaultValue={asset?.name} className="field" /></Field>
        <Row>
          <Field label="Serial number"><input name="serial_no" defaultValue={asset?.serial_no ?? ""} className="field" /></Field>
          <Field label="Location"><input name="location" defaultValue={asset?.location ?? ""} className="field" /></Field>
        </Row>
        <Row>
          <Field label="Purchase date"><input name="purchase_date" type="date" defaultValue={asset?.purchase_date ?? ""} className="field" /></Field>
          <Field label="Purchase cost"><input name="purchase_cost" type="number" step="0.01" min="0" defaultValue={asset?.purchase_cost ?? 0} className="field" /></Field>
        </Row>
        <Row>
          <Field label="Useful life (years)" hint="Used for straight-line depreciation.">
            <input name="useful_life_years" type="number" min="1" defaultValue={asset?.useful_life_years ?? 5} className="field" />
          </Field>
          <Field label="Supplier"><Select name="vendor_id" className="field" defaultValue={asset?.vendor_id ?? ""}><option value="">Unknown</option>{opts(vendors)}</Select></Field>
        </Row>
        <Row>
          <Field label="Status">
            <Select name="status" className="field" defaultValue={asset?.status ?? "in_store"}>
              {["in_store", "assigned", "maintenance", "retired", "disposed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </Field>
          <Field label="Notes"><input name="notes" defaultValue={asset?.notes ?? ""} className="field" /></Field>
        </Row>
        <SubmitBtn className="w-full">{asset ? "Save changes" : "Add asset"}</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function AssignAssetForm({ action, assetId, users }: { action: Action; assetId: number; users: Opt[] }) {
  return (
    <Dialog label="Assign" title="Assign this asset" description="Any open assignment is closed first.">
      <ActionForm action={action} className="space-y-4">
        <input type="hidden" name="asset_id" value={assetId} />
        <Field label="Assign to"><select name="user_id" required className="field">{opts(users)}</select></Field>
        <Row>
          <Field label="From"><input name="assigned_on" type="date" defaultValue={today()} className="field" /></Field>
          <Field label="Condition"><input name="condition" className="field" placeholder="e.g. New, good" /></Field>
        </Row>
        <Field label="Note"><input name="note" className="field" /></Field>
        <SubmitBtn className="w-full">Assign</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}
