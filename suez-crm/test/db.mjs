// CRM invariants exercised against this system's separate database.
// Every test rolls back, so seed data is never changed.
import assert from "node:assert/strict";
import pg from "pg";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  /* CI may provide the environment. */
}

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("· db tests skipped — set DATABASE_URL (or TEST_DATABASE_URL) to run them");
  process.exit(0);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:\/]/.test(url);
const target = /\.neon\.tech/.test(url) ? "Neon" : isLocal ? "local Postgres" : "remote Postgres";
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
  } catch (error) {
    await client.query("rollback").catch(() => {});
    await client.end().catch(() => {});
    console.error(`✗ ${name}\n  ${error.message}`);
    process.exit(1);
  }
  await client.query("rollback");
}
const one = async (text, params) => (await client.query(text, params)).rows[0];

await test("the CRM database contains CRM tables and no ERP domain tables", async () => {
  for (const table of ["crm_companies", "crm_contacts", "crm_deals", "crm_leads", "crm_quotes",
                       "crm_tickets", "crm_campaigns", "crm_saved_kpis",
                       "crm_deposits", "crm_deposit_entries", "crm_deposit_items"]) {
    const row = await one("select to_regclass($1) as name", [table]);
    assert.equal(row.name, table, `${table} is missing`);
  }
  for (const table of ["memos", "leave_requests", "workflow_requests", "projects", "invoices", "inventory_items", "assets", "mail_accounts"]) {
    const row = await one("select to_regclass($1) as name", [table]);
    assert.equal(row.name, null, `${table} leaked into the CRM database`);
  }
  // Automations, the conversation timeline and lead capture were removed. Their
  // tables must go with them, or the next person will find them and wonder.
  for (const table of ["crm_workflows", "crm_workflow_runs", "crm_conversations",
                       "crm_messages", "crm_capture_forms", "crm_lead_captures"]) {
    const row = await one("select to_regclass($1) as name", [table]);
    assert.equal(row.name, null, `${table} outlived the feature it belonged to`);
  }
});

/**
 * The deposit ledger is the balance.
 *
 * Nothing stores a running total, so this proves the two things the feature
 * rests on: the view adds the ledger up correctly, and a drawdown that would
 * take the balance below zero writes nothing at all.
 */
await test("a deposit balance is the sum of its ledger, and cannot go below zero", async () => {
  const owner = await one("select id from users order by id limit 1");
  const company = await one(
    "insert into crm_companies (name,owner_id) values ('Ledger test Ltd',$1) returning id", [owner.id]);
  const deposit = await one(
    `insert into crm_deposits (company_id,name,owner_id,created_by) values ($1,'Ledger test',$2,$2) returning id`,
    [company.id, owner.id]);

  await client.query(
    `insert into crm_deposit_entries (deposit_id,kind,amount,description,recorded_by)
     values ($1,'funding',500000000,'Opening',$2)`, [deposit.id, owner.id]);
  await client.query(
    `insert into crm_deposit_entries (deposit_id,kind,amount,description,recorded_by)
     values ($1,'drawdown',-121430000,'Units supplied',$2)`, [deposit.id, owner.id]);

  const balance = await one("select funded, drawn, balance from crm_deposit_balances where deposit_id = $1", [deposit.id]);
  assert.equal(Number(balance.funded), 500000000, "funding is summed");
  assert.equal(Number(balance.drawn), 121430000, "drawdowns are summed");
  assert.equal(Number(balance.balance), 378570000, "and the balance is the difference");

  // The guard the action uses, written the same way: the insert's own select
  // recomputes the balance as it commits, so a race cannot slip past it.
  const over = await client.query(
    `insert into crm_deposit_entries (deposit_id,kind,amount,description,recorded_by)
     select $1,'drawdown',-400000000,'Overdraw',$2
      where (select coalesce(sum(amount),0) from crm_deposit_entries where deposit_id = $1) >= 400000000
     returning id`, [deposit.id, owner.id]);
  assert.equal(over.rowCount, 0, "a drawdown larger than the balance writes nothing");

  /**
   * The CHECK constraints keep the signs honest whatever the caller intends.
   *
   * Each expected failure gets its own savepoint: every test here runs inside a
   * transaction, and a statement that raises aborts the whole block, so without
   * this the first rejection would make the second fail with "current
   * transaction is aborted" instead of the constraint it is meant to prove.
   */
  const refuses = async (kind, amount, why) => {
    await client.query("savepoint sign_check");
    await assert.rejects(
      client.query(
        `insert into crm_deposit_entries (deposit_id,kind,amount,recorded_by) values ($1,$2,$3,$4)`,
        [deposit.id, kind, amount, owner.id]),
      /violates check constraint/, why);
    await client.query("rollback to savepoint sign_check");
  };
  await refuses("funding", -1, "funding cannot be negative");
  await refuses("drawdown", 1, "a drawdown cannot be positive");
  await refuses("refund", 1, "a refund cannot be positive");
  await refuses("adjustment", 0, "an adjustment of nothing is not an adjustment");
});

await test("every CRM status CHECK accepts the values written by the app", async () => {
  const pairs = [
    ["crm_companies", "status", ["lead", "prospect", "customer", "churned"]],
    ["crm_deals", "stage", ["qualification", "proposal", "negotiation", "won", "lost"]],
    ["crm_leads", "status", ["new", "contacted", "qualified", "unqualified", "converted"]],
    ["crm_quotes", "status", ["draft", "sent", "accepted", "declined", "expired"]],
    ["crm_tickets", "status", ["open", "in_progress", "waiting_customer", "resolved", "closed"]],
    ["crm_campaigns", "status", ["draft", "scheduled", "running", "completed", "cancelled"]],
  ];
  for (const [table, column, values] of pairs) {
    const row = await one(
      `select pg_get_constraintdef(c.oid) as def from pg_constraint c
        join pg_class t on t.oid = c.conrelid
       where t.relname = $1 and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%' || $2 || '%'`,
      [table, column],
    );
    assert.ok(row, `${table}.${column} has no CHECK constraint`);
    for (const value of values) assert.ok(row.def.includes(`'${value}'`), `${table}.${column} rejects ${value}`);
  }
});

await test("campaign recipients cannot be duplicated", async () => {
  const owner = await one("select id from users order by id limit 1");
  const campaign = await one("insert into crm_campaigns (name, owner_id) values ('Test campaign',$1) returning id", [owner.id]);
  await client.query("insert into crm_campaign_recipients (campaign_id, email) values ($1,'person@example.com')", [campaign.id]);
  await assert.rejects(
    client.query("insert into crm_campaign_recipients (campaign_id, email) values ($1,'person@example.com')", [campaign.id]),
    /duplicate key/,
  );
});

await test("quote and ticket references are protected by unique indexes", async () => {
  for (const table of ["crm_quotes", "crm_tickets"]) {
    const row = await one(
      "select count(*)::int as n from pg_indexes where tablename = $1 and indexdef ilike '%unique%(ref)%'",
      [table],
    );
    assert.ok(row.n > 0, `${table}.ref is not unique`);
  }
});

if (target === "Neon") {
  await test("the Neon serverless driver reaches the same CRM database", async () => {
    process.env.DATABASE_URL = url;
    const { sql, driverKind } = await import("../lib/db.ts");
    assert.equal(driverKind(url), "neon");
    const rows = await sql`select 1 as ok, current_database() as db`;
    assert.equal(Number(rows[0].ok), 1);

    /**
     * Dates must be strings on both drivers.
     *
     * The CRM compares date columns as YYYY-MM-DD and slices them — a deposit's
     * occurred_on, a quote's valid_until, a deal's expected_close. Neon parses
     * them into Date objects unless told otherwise, which turns every one of
     * those comparisons false without ever raising anything. This is the assert
     * that would have caught it.
     */
    const [d] = await sql`select current_date as d, now() as t`;
    assert.equal(typeof d.d, "string", "Neon returns date as a string");
    assert.equal(typeof d.t, "string", "Neon returns timestamptz as a string");
    assert.match(d.d, /^\d{4}-\d{2}-\d{2}$/, "and a date is plain YYYY-MM-DD");

    const viaPg = await one(`select current_date as d, now() as t`);
    assert.equal(typeof viaPg.d, "string", "node-postgres returns date as a string too");
    assert.equal(typeof viaPg.t, "string", "and timestamptz");
  });
}

await client.end();
console.log(`✓ db: ${passed} CRM invariants (${target})`);
