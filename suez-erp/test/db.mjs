// Invariants that live in SQL, exercised against a real database.
//
// These are the rules no unit test can prove: that receiving a purchase order
// twice does not double the stock, that an import re-run corrects rows instead
// of duplicating them, that a payment re-derives the invoice status. Each test
// works in its own transaction and rolls back, so the demo data is untouched.
import assert from "node:assert/strict";
import pg from "pg";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  /* env may come from the shell, as it does in CI */
}

/**
 * Runs against whatever DATABASE_URL points at — the dockerised Postgres or a
 * Neon database. node-postgres speaks the wire protocol to both, so the same
 * invariants are checked wherever the system is deployed; there is no point
 * proving them locally and leaving production unchecked.
 *
 * Set TEST_DATABASE_URL to run against a scratch database instead. Every test
 * works inside a transaction and rolls back either way, so nothing is written.
 */
const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("· db tests skipped — set DATABASE_URL (or TEST_DATABASE_URL) to run them");
  process.exit(0);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:\/]/.test(url);
const target = /\.neon\.tech/.test(url) ? "Neon" : isLocal ? "local Postgres" : "remote Postgres";

// Match the app's type handling so the tests see what the app sees.
for (const oid of [1082, 1114, 1184, 1083, 1266]) pg.types.setTypeParser(oid, (v) => v);

const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});
await client.connect();

let passed = 0;
async function test(name, fn) {
  await client.query("begin");
  try {
    await fn();
    passed++;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    await client.end().catch(() => {});
    console.error(`✗ ${name}\n  ${e.message}`);
    process.exit(1);
  }
  await client.query("rollback");
}
const one = async (text, params) => (await client.query(text, params)).rows[0];

await test("the ERP database contains ERP tables and no CRM domain tables", async () => {
  for (const table of ["memos", "leave_requests", "workflow_requests", "projects", "invoices", "inventory_items", "assets", "mail_accounts", "mail_folders"]) {
    const row = await one("select to_regclass($1) as name", [table]);
    assert.equal(row.name, table, `${table} is missing`);
  }
  for (const table of ["crm_companies", "crm_contacts", "crm_deals", "crm_leads", "crm_quotes", "crm_tickets", "crm_campaigns"]) {
    const row = await one("select to_regclass($1) as name", [table]);
    assert.equal(row.name, null, `${table} leaked into the ERP database`);
  }
});

/* ---------------------------------------------- schema is self-consistent */
await test("every status CHECK accepts the value the code writes", async () => {
  // A status the app writes but the constraint rejects fails at runtime, not build.
  const pairs = [
    ["invoices", "status", ["draft", "sent", "part_paid", "paid", "overdue", "void"]],
    ["expenses", "status", ["pending", "approved", "rejected", "reimbursed"]],
    ["purchase_orders", "status", ["draft", "sent", "part_received", "received", "cancelled"]],
    ["purchase_requisitions", "status", ["draft", "pending", "approved", "rejected", "ordered"]],
    ["timesheets", "status", ["draft", "submitted", "approved", "rejected"]],
    ["project_tasks", "status", ["todo", "in_progress", "blocked", "done"]],
  ];
  for (const [table, col, values] of pairs) {
    const def = await one(
      `select pg_get_constraintdef(c.oid) as def from pg_constraint c
        join pg_class t on t.oid = c.conrelid
       where t.relname = $1 and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%' || $2 || '%'`,
      [table, col],
    );
    assert.ok(def, `${table}.${col} has no CHECK constraint`);
    for (const v of values) {
      assert.ok(def.def.includes(`'${v}'`), `${table}.${col} CHECK rejects '${v}' which the app writes`);
    }
  }
});

/* --------------------------------------------------- payment derivation */
await test("invoice status follows the payments table, not the other way round", async () => {
  const inv = await one(
    `insert into invoices (ref, kind, issue_date, currency, subtotal, tax_rate, tax_amount, total, status)
     values ('TEST/INV/1','sales',current_date,'NGN',1000,7.5,75,1075,'sent') returning id`);

  const settle = async () =>
    one(`update invoices i set amount_paid = p.total,
             status = case when p.total >= i.total then 'paid'
                           when p.total > 0 then 'part_paid' else i.status end
           from (select coalesce(sum(amount),0) as total from payments where invoice_id = $1) p
          where i.id = $1 returning i.status, i.amount_paid`, [inv.id]);

  await client.query(`insert into payments (invoice_id, amount, paid_on, method) values ($1, 500, current_date, 'transfer')`, [inv.id]);
  let r = await settle();
  assert.equal(r.status, "part_paid", "a partial payment is part_paid");
  assert.equal(Number(r.amount_paid), 500);

  await client.query(`insert into payments (invoice_id, amount, paid_on, method) values ($1, 575, current_date, 'transfer')`, [inv.id]);
  r = await settle();
  assert.equal(r.status, "paid", "settling the balance marks it paid");
  assert.equal(Number(r.amount_paid), 1075);
});

/* ------------------------------------------------ stock receipt is idempotent */
await test("receiving a purchase order twice does not double the stock", async () => {
  const item = await one(
    `insert into inventory_items (sku, name, unit, quantity, reorder_level, unit_cost)
     values ('TEST-SKU-1','Test pump','each',2,4,100) returning id`);
  const po = await one(
    `insert into purchase_orders (ref, order_date, currency, subtotal, tax_amount, total, status)
     values ('TEST/PO/1', current_date,'NGN',1000,75,1075,'sent') returning id`);
  await client.query(
    `insert into purchase_order_lines (po_id, item_id, description, quantity, received_qty, unit_price, line_total)
     values ($1,$2,'Test pump',10,0,100,1000)`, [po.id, item.id]);

  // Exactly what receivePurchaseOrder does: only the outstanding quantity moves.
  const receive = async () => {
    const { rows } = await client.query(
      `select id, item_id, quantity, received_qty from purchase_order_lines where po_id = $1`, [po.id]);
    for (const l of rows) {
      const outstanding = Number(l.quantity) - Number(l.received_qty);
      if (outstanding <= 0) continue;
      await client.query(`update purchase_order_lines set received_qty = quantity where id = $1`, [l.id]);
      await client.query(
        `insert into stock_movements (item_id, kind, quantity, reason, po_id) values ($1,'in',$2,'Received on PO',$3)`,
        [l.item_id, outstanding, po.id]);
      await client.query(`update inventory_items set quantity = quantity + $1 where id = $2`, [outstanding, l.item_id]);
    }
    await client.query(`update purchase_orders set status = 'received' where id = $1`, [po.id]);
  };

  await receive();
  let q = await one(`select quantity from inventory_items where id = $1`, [item.id]);
  assert.equal(Number(q.quantity), 12, "stock goes 2 -> 12 on receipt");

  await receive(); // the double-click, or a second person pressing it
  q = await one(`select quantity from inventory_items where id = $1`, [item.id]);
  assert.equal(Number(q.quantity), 12, "receiving again must not add another 10");

  const moves = await one(`select count(*)::int as n from stock_movements where po_id = $1`, [po.id]);
  assert.equal(moves.n, 1, "and must not log a second movement");
});

/* -------------------------------------- stock and its movement log agree */
await test("on-hand equals the sum of its movements", async () => {
  const item = await one(
    `insert into inventory_items (sku, name, unit, quantity, reorder_level, unit_cost)
     values ('TEST-SKU-2','Ledger check','each',0,0,10) returning id`);
  for (const [kind, qty, delta] of [["in", 10, 10], ["out", 3, -3], ["in", 5, 5]]) {
    await client.query(`insert into stock_movements (item_id, kind, quantity, reason) values ($1,$2,$3,'test')`, [item.id, kind, qty]);
    await client.query(`update inventory_items set quantity = quantity + $1 where id = $2`, [delta, item.id]);
  }
  const r = await one(
    `select i.quantity,
            (select coalesce(sum(case when kind='out' then -quantity else quantity end),0)
               from stock_movements where item_id = i.id) as ledger
       from inventory_items i where i.id = $1`, [item.id]);
  assert.equal(Number(r.quantity), 12);
  assert.equal(Number(r.ledger), 12, "the running total and the movement log must not drift");
});

/* ------------------------------------------------- import is a true upsert */
await test("re-importing a corrected spreadsheet fixes rows instead of duplicating them", async () => {
  const upsert = (sku, name, cost) => client.query(
    `insert into inventory_items (sku, name, unit, quantity, reorder_level, unit_cost)
     values ($1,$2,'each',5,1,$3)
     on conflict (sku) do update set name = excluded.name, unit_cost = excluded.unit_cost`, [sku, name, cost]);

  await upsert("TEST-IMP-1", "Pump (typo)", 100);
  await upsert("TEST-IMP-1", "Pump 7.5HP", 820);
  const rows = await one(`select count(*)::int as n from inventory_items where sku = 'TEST-IMP-1'`);
  assert.equal(rows.n, 1, "one SKU, one row");
  const row = await one(`select name, unit_cost, quantity from inventory_items where sku = 'TEST-IMP-1'`);
  assert.equal(row.name, "Pump 7.5HP", "the corrected name wins");
  assert.equal(Number(row.unit_cost), 820, "and the corrected cost");
  assert.equal(Number(row.quantity), 5, "but the on-hand quantity is not reset by a re-import");
});

/* ------------------------------------------------ leave overlap detection */
await test("overlapping leave is caught by the date range, including touching edges", async () => {
  const [user] = (await client.query(`select id from users order by id limit 1`)).rows;
  const [type] = (await client.query(`select id from leave_types order by id limit 1`)).rows;
  await client.query(
    `insert into leave_requests (ref, user_id, leave_type_id, start_date, end_date, days, status)
     values ('TEST/LV/1',$1,$2,'2026-11-10','2026-11-14',5,'approved')`, [user.id, type.id]);

  const clashes = async (a, b) => Number((await one(
    `select count(*)::int as n from leave_requests
      where user_id = $1 and status in ('pending','approved')
        and daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')`,
    [user.id, a, b])).n);

  assert.ok(await clashes("2026-11-12", "2026-11-13") > 0, "a request inside an approved one clashes");
  assert.ok(await clashes("2026-11-14", "2026-11-18") > 0, "sharing the last day clashes");
  assert.ok(await clashes("2026-11-05", "2026-11-10") > 0, "sharing the first day clashes");
  assert.equal(await clashes("2026-11-15", "2026-11-20"), 0, "the day after is free");
  assert.equal(await clashes("2026-11-01", "2026-11-09"), 0, "the day before is free");
});

/* --------------------------------------------- one open asset assignment */
await test("an asset is only ever with one person", async () => {
  const asset = await one(`insert into assets (tag, name, category) values ('TEST-AST-1','Test laptop','it') returning id`);
  const { rows: users } = await client.query(`select id from users order by id limit 2`);
  const assign = async (uid) => {
    await client.query(`update asset_assignments set returned_on = current_date where asset_id = $1 and returned_on is null`, [asset.id]);
    await client.query(`insert into asset_assignments (asset_id, user_id, assigned_on) values ($1,$2,current_date)`, [asset.id, uid]);
    await client.query(`update assets set status = 'assigned' where id = $1`, [asset.id]);
  };
  await assign(users[0].id);
  await assign(users[1].id);
  const open = await one(`select count(*)::int as n from asset_assignments where asset_id = $1 and returned_on is null`, [asset.id]);
  assert.equal(open.n, 1, "reassigning closes the previous holder's record");
  const holder = await one(`select user_id from asset_assignments where asset_id = $1 and returned_on is null`, [asset.id]);
  assert.equal(holder.user_id, users[1].id, "and the open one is the new holder");
});

/* --------------------------------------- references are unique under load */
await test("document references cannot collide", async () => {
  const a = await one(`select nextval('finance_ref_seq') as n`);
  const b = await one(`select nextval('finance_ref_seq') as n`);
  assert.notEqual(a.n, b.n, "the sequence hands out distinct values");
  for (const t of ["invoices", "expenses", "purchase_orders", "purchase_requisitions"]) {
    const u = await one(
      `select count(*)::int as n from pg_indexes where tablename = $1 and indexdef ilike '%unique%(ref)%'`, [t]);
    assert.ok(u.n > 0, `${t}.ref is not protected by a unique index`);
  }
});

/* ------------------------------- both drivers, against the same database */
// When pointed at Neon, prove the driver the app actually uses in production
// reaches the same database node-postgres just did. This is the one path that
// cannot be exercised locally, so it runs exactly when it can: on Neon.
if (target === "Neon") {
  await test("the Neon serverless driver reaches the same database", async () => {
    process.env.DATABASE_URL = url;
    const { sql, driverKind } = await import("../lib/db.ts");
    assert.equal(driverKind(url), "neon", "a Neon URL must select the Neon driver");
    const rows = await sql`select 1 as ok, current_database() as db`;
    assert.equal(Number(rows[0].ok), 1, "the Neon HTTP driver returns rows");

    // The divergence that bit us once: dates must be strings on both drivers.
    const [d] = await sql`select current_date as d, now() as t`;
    assert.equal(typeof d.d, "string", "Neon returns date as a string");
    assert.equal(typeof d.t, "string", "Neon returns timestamptz as a string");
    const viaPg = await one(`select current_date as d, now() as t`);
    assert.equal(typeof viaPg.d, "string", "node-postgres returns date as a string too");
    assert.equal(typeof viaPg.t, "string", "and timestamptz");
  });
}

await client.end();
console.log(`✓ db: ${passed} integration invariants (${target})`);
