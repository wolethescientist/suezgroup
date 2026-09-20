"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireCap, requireUser } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { nextRef } from "@/lib/refs";
import { isSelfApproval, SELF_APPROVAL_MESSAGE } from "@/lib/permissions";

import { documentTotals } from "@/lib/money";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => Number(str(fd, k) || 0);

/* ---------------------------------------------------------------- vendors */

export async function saveVendor(fd: FormData) {
  const me = await requireCap("vendor.manage");
  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  if (!name) return { error: "The vendor needs a name." };

  if (id) {
    await sql`
      update vendors set name = ${name}, category = ${str(fd, "category") || null}, email = ${str(fd, "email") || null},
                         phone = ${str(fd, "phone") || null}, address = ${str(fd, "address") || null},
                         tax_id = ${str(fd, "tax_id") || null}, bank_details = ${str(fd, "bank_details") || null},
                         rating = ${Number(str(fd, "rating")) || null}, status = ${str(fd, "status") || "active"},
                         notes = ${str(fd, "notes") || null}
       where id = ${id}`;
    await audit(me.id, "vendor.update", "vendor", id);
  } else {
    await sql`
      insert into vendors (name, category, email, phone, address, tax_id, bank_details, rating, status, notes)
      values (${name}, ${str(fd, "category") || null}, ${str(fd, "email") || null}, ${str(fd, "phone") || null},
              ${str(fd, "address") || null}, ${str(fd, "tax_id") || null}, ${str(fd, "bank_details") || null},
              ${Number(str(fd, "rating")) || null}, ${str(fd, "status") || "active"}, ${str(fd, "notes") || null})`;
    await audit(me.id, "vendor.create", "vendor", undefined, { name });
  }
  revalidatePath("/procurement");
  return { ok: true };
}

export async function deleteVendor(fd: FormData) {
  const me = await requireCap("vendor.delete");
  const id = Number(str(fd, "id"));
  await sql`delete from vendors where id = ${id}`;
  await audit(me.id, "vendor.delete", "vendor", id);
  revalidatePath("/procurement");
  return { ok: true };
}

/* ----------------------------------------------------------- requisitions */

export async function raiseRequisition(fd: FormData) {
  const me = await requireUser();
  const title = str(fd, "title");
  if (!title) return { error: "Say what is being requested." };

  const ref = await nextRef("PR");
  const [r] = await sql<{ id: number }>`
    insert into purchase_requisitions (ref, title, requester_id, department_id, project_id, justification,
                                       needed_by, estimated_cost, currency, status)
    values (${ref}, ${title}, ${me.id}, ${me.department_id}, ${Number(str(fd, "project_id")) || null},
            ${str(fd, "justification") || null}, ${str(fd, "needed_by") || null},
            ${num(fd, "estimated_cost")}, ${str(fd, "currency") || "NGN"}, 'pending')
    returning id`;

  // The head of the department that wants the thing, plus the procurement desk.
  // It used to go to admin+HR, which is how the Head of HR ended up approving
  // electrical spares while the Head of Operations could not.
  const approvers = await sql<{ id: number }>`
    select distinct u.id from users u
      left join role_permissions rp on rp.role_key = u.role and rp.capability = 'requisition.approve'
     where u.status = 'active'
       and (rp.capability is not null or u.id = (select head_id from departments where id = ${me.department_id}))
       and u.id <> ${me.id}`;
  await notify(
    approvers.map((a) => a.id),
    "Purchase requisition raised",
    `${me.full_name}: ${title}`,
    `/procurement/requisitions/${r.id}`,
  );
  await audit(me.id, "requisition.raise", "requisition", r.id, { ref });
  revalidatePath("/procurement");
  redirect(`/procurement/requisitions/${r.id}`);
}

export async function decideRequisition(fd: FormData) {
  const me = await requireCap("requisition.approve");
  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision");
  if (!["approved", "rejected"].includes(decision)) return { error: "Unknown decision." };

  const [r] = await sql<{ requester_id: number; ref: string; status: string }>`
    select requester_id, ref, status from purchase_requisitions where id = ${id}`;
  if (!r) return { error: "That requisition no longer exists." };
  if (r.status !== "pending") return { error: `That requisition is already ${r.status}.` };
  // Segregation of duties: the requester is never the approver, however senior.
  if (isSelfApproval(me, r.requester_id)) return { error: SELF_APPROVAL_MESSAGE };

  await sql`
    update purchase_requisitions set status = ${decision}, approver_id = ${me.id}, decided_at = now(),
                                     decision_note = ${str(fd, "note") || null}
     where id = ${id}`;
  await notify([r.requester_id], `Requisition ${r.ref} ${decision}`, str(fd, "note") || null, `/procurement/requisitions/${id}`);
  await audit(me.id, `requisition.${decision}`, "requisition", id);
  revalidatePath(`/procurement/requisitions/${id}`);
  revalidatePath("/procurement");
  return { ok: true };
}

/* --------------------------------------------------------- purchase orders */

export async function createPurchaseOrder(fd: FormData) {
  const me = await requireCap("po.manage");
  const vendorId = Number(str(fd, "vendor_id"));
  if (!vendorId) return { error: "Pick a vendor." };
  const orderDate = str(fd, "order_date");
  const expected = str(fd, "expected_date");
  if (orderDate && expected && expected < orderDate)
    return { error: "The expected date cannot be before the order date." };

  const desc = fd.getAll("line_desc").map((v) => v.toString().trim());
  const qty = fd.getAll("line_qty").map((v) => Number(v.toString() || 0));
  const price = fd.getAll("line_price").map((v) => Number(v.toString() || 0));
  const items = fd.getAll("line_item").map((v) => Number(v.toString() || 0) || null);
  const lines = desc
    .map((d, i) => ({ description: d, quantity: qty[i] || 0, unit_price: price[i] || 0, item_id: items[i] ?? null }))
    .filter((l) => l.description && l.quantity > 0);
  if (!lines.length) return { error: "Add at least one line." };

  const t = documentTotals(lines);
  const ref = await nextRef("PO");

  const [po] = await sql<{ id: number }>`
    insert into purchase_orders (ref, requisition_id, vendor_id, order_date, expected_date, currency,
                                 subtotal, tax_amount, total, status, notes, created_by)
    values (${ref}, ${Number(str(fd, "requisition_id")) || null}, ${vendorId},
            ${str(fd, "order_date") || new Date().toISOString().slice(0, 10)}, ${str(fd, "expected_date") || null},
            ${str(fd, "currency") || "NGN"}, ${t.subtotal}, ${t.tax}, ${t.total}, 'draft',
            ${str(fd, "notes") || null}, ${me.id})
    returning id`;

  for (const l of lines) {
    await sql`
      insert into purchase_order_lines (po_id, item_id, description, quantity, unit_price, line_total)
      values (${po.id}, ${l.item_id}, ${l.description}, ${l.quantity}, ${l.unit_price}, ${l.quantity * l.unit_price})`;
  }
  if (Number(str(fd, "requisition_id")))
    await sql`update purchase_requisitions set status = 'ordered' where id = ${Number(str(fd, "requisition_id"))}`;

  await audit(me.id, "po.create", "po", po.id, { ref, total: t.total });
  revalidatePath("/procurement");
  redirect(`/procurement/orders/${po.id}`);
}

/**
 * Marks a PO received and moves the goods into stock.
 *
 * Stock is only credited for lines that name an inventory item, and only for
 * the quantity not already received, so receiving a PO twice cannot double the
 * on-hand figure.
 */
/**
 * Goods receipt, line by line.
 *
 * ponytail: this used to receive the whole order on one click, so a part
 * delivery — the normal case — could not be recorded at all and RECEIVED was
 * only ever 0 or the full quantity. It now takes a quantity per line, clamps to
 * what is still outstanding, and leaves the order 'part_received' until every
 * line is complete. The stock movement carries the PO reference so the ledger
 * traces back to the order.
 */
export async function receivePurchaseOrder(fd: FormData) {
  const me = await requireCap("po.manage");
  const id = Number(str(fd, "id"));

  const [po] = await sql<{ ref: string; status: string }>`
    select ref, status from purchase_orders where id = ${id}`;
  if (!po) return { error: "That order no longer exists." };
  if (po.status === "cancelled") return { error: "That order was cancelled." };
  if (po.status === "draft") return { error: "Send the order to the vendor before receiving against it." };

  const lines = await sql<{ id: number; item_id: number | null; quantity: string; received_qty: string; description: string }>`
    select id, item_id, quantity, received_qty, description from purchase_order_lines where po_id = ${id}`;

  const lineIds = fd.getAll("line_id").map((v) => Number(v.toString()));
  const qtys = fd.getAll("receive_qty").map((v) => Number(v.toString() || 0));
  const asked = new Map<number, number>();
  lineIds.forEach((lid, i) => asked.set(lid, qtys[i] || 0));

  let moved = 0;
  for (const l of lines) {
    const outstanding = Number(l.quantity) - Number(l.received_qty);
    if (outstanding <= 0) continue;
    // No quantities posted at all means "receive the rest", which keeps the
    // one-click path working for a complete delivery.
    const want = asked.size ? (asked.get(l.id) ?? 0) : outstanding;
    if (want <= 0) continue;
    if (want > outstanding)
      return { error: `Only ${outstanding} of "${l.description}" is still outstanding on ${po.ref}.` };

    await sql`update purchase_order_lines set received_qty = received_qty + ${want} where id = ${l.id}`;
    moved += want;
    if (!l.item_id) continue;
    await sql`
      insert into stock_movements (item_id, kind, quantity, reason, reference, po_id, moved_by)
      values (${l.item_id}, 'in', ${want}, ${`Received on ${po.ref}`}, ${po.ref}, ${id}, ${me.id})`;
    await sql`update inventory_items set quantity = quantity + ${want} where id = ${l.item_id}`;
  }

  if (!moved) return { error: "Enter how much of each line arrived." };

  const [{ outstanding_lines }] = await sql<{ outstanding_lines: number }>`
    select count(*)::int as outstanding_lines
      from purchase_order_lines where po_id = ${id} and received_qty < quantity`;
  const status = outstanding_lines > 0 ? "part_received" : "received";
  await sql`update purchase_orders set status = ${status} where id = ${id}`;

  await audit(me.id, "po.receive", "po", id, { moved, status });
  revalidatePath(`/procurement/orders/${id}`);
  revalidatePath("/procurement");
  revalidatePath("/inventory");
  return {
    ok: true,
    message: outstanding_lines > 0 ? "Part delivery recorded and added to stock." : "Received in full and added to stock.",
  };
}

export async function setPoStatus(fd: FormData) {
  const me = await requireCap("po.manage");
  const id = Number(str(fd, "id"));
  const status = str(fd, "status");
  if (!["draft", "sent", "cancelled", "closed"].includes(status)) return { error: "Unknown status." };
  await sql`update purchase_orders set status = ${status} where id = ${id}`;
  await audit(me.id, "po.status", "po", id, { status });
  revalidatePath(`/procurement/orders/${id}`);
  return { ok: true };
}

/* -------------------------------------------------------------- inventory */

export async function saveItem(fd: FormData) {
  const me = await requireCap("inventory.manage");
  const id = Number(str(fd, "id")) || null;
  const sku = str(fd, "sku");
  const name = str(fd, "name");
  if (!sku || !name) return { error: "An item needs both an SKU and a name." };

  if (id) {
    await sql`
      update inventory_items set sku = ${sku}, name = ${name}, category = ${str(fd, "category") || null},
                                 unit = ${str(fd, "unit") || "each"}, reorder_level = ${num(fd, "reorder_level")},
                                 unit_cost = ${num(fd, "unit_cost")}, warehouse_id = ${Number(str(fd, "warehouse_id")) || null},
                                 status = ${str(fd, "status") || "active"}
       where id = ${id}`;
    await audit(me.id, "item.update", "item", id);
  } else {
    const [dupe] = await sql<{ id: number }>`select id from inventory_items where sku = ${sku}`;
    if (dupe) return { error: `SKU ${sku} is already in use.` };
    const opening = num(fd, "quantity");
    const [created] = await sql<{ id: number }>`
      insert into inventory_items (sku, name, category, unit, reorder_level, unit_cost, warehouse_id, quantity, status)
      values (${sku}, ${name}, ${str(fd, "category") || null}, ${str(fd, "unit") || "each"},
              ${num(fd, "reorder_level")}, ${num(fd, "unit_cost")}, ${Number(str(fd, "warehouse_id")) || null},
              ${opening}, ${str(fd, "status") || "active"})
      returning id`;
    // The opening balance is a movement like any other. Without this row the
    // ledger never reconciled to the on-hand figure it is supposed to explain.
    if (opening > 0) {
      await sql`
        insert into stock_movements (item_id, kind, quantity, reason, moved_by)
        values (${created.id}, 'in', ${opening}, 'Opening balance', ${me.id})`;
    }
    await audit(me.id, "item.create", "item", created.id, { sku, opening });
  }
  revalidatePath("/inventory");
  return { ok: true };
}

/** Stock only ever moves through here, so `quantity` and the movement log agree. */
export async function moveStock(fd: FormData) {
  const me = await requireCap("inventory.manage");
  const itemId = Number(str(fd, "item_id"));
  const kind = str(fd, "kind");
  const qty = num(fd, "quantity");
  if (!["in", "out", "adjust"].includes(kind)) return { error: "Unknown movement type." };
  if (qty <= 0) return { error: "Enter a quantity greater than zero." };

  const [item] = await sql<{ quantity: string; name: string }>`select quantity, name from inventory_items where id = ${itemId}`;
  if (!item) return { error: "That item no longer exists." };
  if (kind === "out" && qty > Number(item.quantity))
    return { error: `Only ${item.quantity} of ${item.name} in stock.` };

  const delta = kind === "in" ? qty : kind === "out" ? -qty : qty - Number(item.quantity);
  await sql`
    insert into stock_movements (item_id, kind, quantity, reason, reference, moved_by)
    values (${itemId}, ${kind}, ${Math.abs(delta) || qty}, ${str(fd, "reason") || null}, ${str(fd, "reference") || null}, ${me.id})`;
  await sql`update inventory_items set quantity = quantity + ${delta} where id = ${itemId}`;

  await audit(me.id, "stock.move", "item", itemId, { kind, qty });
  revalidatePath("/inventory");
  return { ok: true };
}

export async function saveWarehouse(fd: FormData) {
  const me = await requireCap("inventory.manage");
  const name = str(fd, "name");
  if (!name) return { error: "The location needs a name." };
  await sql`
    insert into warehouses (name, location, manager_id)
    values (${name}, ${str(fd, "location") || null}, ${Number(str(fd, "manager_id")) || null})
    on conflict (name) do update set location = excluded.location, manager_id = excluded.manager_id`;
  await audit(me.id, "warehouse.save", "warehouse", undefined, { name });
  revalidatePath("/inventory");
  return { ok: true };
}

/* ----------------------------------------------------------------- assets */

export async function saveAsset(fd: FormData) {
  const me = await requireCap("asset.manage");
  const id = Number(str(fd, "id")) || null;
  const tag = str(fd, "tag");
  const name = str(fd, "name");
  if (!tag || !name) return { error: "An asset needs both a tag and a name." };

  if (id) {
    await sql`
      update assets set tag = ${tag}, name = ${name}, category = ${str(fd, "category") || "it"},
                        serial_no = ${str(fd, "serial_no") || null}, purchase_date = ${str(fd, "purchase_date") || null},
                        purchase_cost = ${num(fd, "purchase_cost")},
                        useful_life_years = ${Number(str(fd, "useful_life_years")) || 5},
                        vendor_id = ${Number(str(fd, "vendor_id")) || null}, location = ${str(fd, "location") || null},
                        status = ${str(fd, "status") || "in_store"}, notes = ${str(fd, "notes") || null}
       where id = ${id}`;
    await audit(me.id, "asset.update", "asset", id);
  } else {
    const [dupe] = await sql<{ id: number }>`select id from assets where tag = ${tag}`;
    if (dupe) return { error: `Asset tag ${tag} is already in use.` };
    await sql`
      insert into assets (tag, name, category, serial_no, purchase_date, purchase_cost, useful_life_years,
                          vendor_id, location, status, notes)
      values (${tag}, ${name}, ${str(fd, "category") || "it"}, ${str(fd, "serial_no") || null},
              ${str(fd, "purchase_date") || null}, ${num(fd, "purchase_cost")},
              ${Number(str(fd, "useful_life_years")) || 5}, ${Number(str(fd, "vendor_id")) || null},
              ${str(fd, "location") || null}, ${str(fd, "status") || "in_store"}, ${str(fd, "notes") || null})`;
    await audit(me.id, "asset.create", "asset", undefined, { tag });
  }
  revalidatePath("/assets");
  return { ok: true };
}

/** Closes any open assignment before opening a new one — an asset is with one person at a time. */
export async function assignAsset(fd: FormData) {
  const me = await requireCap("asset.manage");
  const assetId = Number(str(fd, "asset_id"));
  const userId = Number(str(fd, "user_id"));
  if (!userId) return { error: "Pick who it is going to." };

  await sql`update asset_assignments set returned_on = current_date where asset_id = ${assetId} and returned_on is null`;
  await sql`
    insert into asset_assignments (asset_id, user_id, assigned_on, condition, note)
    values (${assetId}, ${userId}, ${str(fd, "assigned_on") || new Date().toISOString().slice(0, 10)},
            ${str(fd, "condition") || null}, ${str(fd, "note") || null})`;
  await sql`update assets set status = 'assigned' where id = ${assetId}`;

  const [a] = await sql<{ name: string; tag: string }>`select name, tag from assets where id = ${assetId}`;
  await notify([userId], "Asset assigned to you", a ? `${a.tag} — ${a.name}` : null, `/assets/${assetId}`);
  await audit(me.id, "asset.assign", "asset", assetId, { userId });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  return { ok: true };
}

export async function returnAsset(fd: FormData) {
  const me = await requireCap("asset.manage");
  const assetId = Number(str(fd, "asset_id"));
  await sql`
    update asset_assignments set returned_on = current_date, condition = coalesce(${str(fd, "condition") || null}, condition)
     where asset_id = ${assetId} and returned_on is null`;
  await sql`update assets set status = 'in_store' where id = ${assetId}`;
  await audit(me.id, "asset.return", "asset", assetId);
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  return { ok: true };
}
