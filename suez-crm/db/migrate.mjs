// Applies db/schema.sql, and with --seed loads demo data.
//   node db/migrate.mjs [--seed]
//
// SuezCRM is a standalone system with its own database — its own
// employees, departments, settings and audit trail.
// ponytail: a pooled connection (not the http driver) because it accepts the
// whole schema file as one multi-statement query. Uses node-postgres for a
// local/dockerised server and the Neon pool for a Neon host — same rule as
// lib/db.ts, so `npm run db:seed` works against either.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { hashPassword } from "../lib/password.ts";
import { BUCKET, ensureBucket, storageEnabled } from "../lib/storage.ts";
import { BUILTIN_ROLES, CAPABILITY_KEYS } from "../lib/capabilities.ts";

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(here, "..", ".env"));
} catch {
  /* env may come from the shell */
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env — run `docker compose up -d` for a local\n" +
      "database, or paste a Neon connection string to use a hosted one.",
  );
  process.exit(1);
}

// One definition of "is this Neon", shared with the app — a second copy here
// drifted from it and would have sent a lookalike host down the wrong driver.
const { driverKind, isLocalHost } = await import("../lib/db.ts");
const isNeon = driverKind(url) === "neon";
const pool = isNeon
  ? new (await import("@neondatabase/serverless")).Pool({ connectionString: url })
  : new (await import("pg")).default.Pool({
      connectionString: url,
      ssl: isLocalHost(url) ? false : { rejectUnauthorized: false },
    });
console.log(`· database: ${isNeon ? "Neon" : isLocalHost(url) ? "local Postgres" : "remote Postgres"}`);
const q = (text, params) => pool.query(text, params);

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function main() {
  console.log("→ applying schema.sql");
  await q(readFileSync(join(here, "schema.sql"), "utf8"));
  console.log("✓ schema applied");

  if (storageEnabled()) {
    console.log(`✓ storage bucket "${BUCKET}" ${await ensureBucket()}`);
  } else {
    console.log("· SUPABASE_URL not set — attachments will be stored in Postgres as base64");
  }

  /**
   * Give every built-in role its capabilities the first time it is seen.
   *
   * Runs on every migrate, not just --seed, because a new capability added in
   * code has to reach the built-in roles somehow. It only ever inserts, so a
   * capability an administrator has deliberately removed stays removed.
   */
  for (const role of BUILTIN_ROLES) {
    const { rows } = await q("select seeded_at from roles where key = $1", [role.key]);
    if (rows[0]?.seeded_at) continue;
    for (const cap of role.caps) {
      await q("insert into role_permissions (role_key, capability) values ($1,$2) on conflict do nothing", [role.key, cap]);
    }
    await q("update roles set seeded_at = now() where key = $1", [role.key]);
    console.log(`✓ role "${role.key}" seeded with ${role.caps.length} capability(ies)`);
  }

  /**
   * Capabilities added to the code *after* a role was seeded.
   *
   * The loop above skips any role with `seeded_at`, which is what protects a
   * capability an administrator deliberately removed. The side effect was that
   * a capability introduced later never reached the built-in roles at all: a
   * release could ship the deposit capabilities and nobody would hold them, on
   * every database except a brand new one.
   *
   * So the set of capability keys the code has ever offered is remembered.
   * Anything not in it is new, and new capabilities are granted to the built-in
   * roles that list them — once. Removing one afterwards still sticks.
   */
  const { rows: seenRow } = await q("select value from settings where key = 'capabilities_seen'");
  let seen = seenRow[0]?.value?.keys;
  if (!Array.isArray(seen)) {
    // First run under this scheme. Treat every capability already granted to
    // some role as known, so re-granting cannot undo an administrator's edits.
    const { rows } = await q("select distinct capability from role_permissions");
    seen = rows.map((r) => r.capability);
  }
  const known = new Set(seen);
  const fresh = CAPABILITY_KEYS.filter((k) => !known.has(k));
  if (fresh.length) {
    let granted = 0;
    for (const role of BUILTIN_ROLES) {
      for (const cap of role.caps) {
        if (!fresh.includes(cap)) continue;
        const { rowCount } = await q(
          "insert into role_permissions (role_key, capability) values ($1,$2) on conflict do nothing",
          [role.key, cap],
        );
        granted += rowCount ?? 0;
      }
    }
    console.log(`✓ ${fresh.length} new capability(ies) in code — ${granted} grant(s) added to built-in roles`);
  }
  await q(
    `insert into settings (key, value) values ('capabilities_seen', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ keys: CAPABILITY_KEYS })],
  );

  const { rows: stale } = await q(
    "delete from role_permissions where capability <> all($1::text[]) returning capability",
    [CAPABILITY_KEYS],
  );
  if (stale.length) console.log(`· dropped ${stale.length} capability grant(s) no longer defined in code`);

  if (!process.argv.includes("--seed")) {
    await pool.end();
    return;
  }

  const { rows: existing } = await q("select count(*)::int as n from users");
  if (existing[0].n > 0) {
    console.log(`✓ seed skipped — ${existing[0].n} users already present`);
    await pool.end();
    return;
  }

  console.log("→ seeding");

  const depts = ["Executive", "Human Resources", "Finance & Accounts", "Operations", "Sales & Marketing", "IT & Digital"];
  const deptId = {};
  for (const name of depts) {
    const { rows } = await q(
      "insert into departments (name, code) values ($1,$2) on conflict (name) do update set code = excluded.code returning id",
      [name, name.split(/[\s&]+/).map((w) => w[0]).join("").toUpperCase()],
    );
    deptId[name] = rows[0].id;
  }

  const people = [
    ["SZ-001", "Adaeze Okonkwo", "admin@suez.local", "admin", "Managing Director", "Executive", null],
    ["SZ-002", "Bello Ibrahim", "hr@suez.local", "hr", "Head, Human Resources", "Human Resources", "SZ-001"],
    ["SZ-003", "Chidinma Eze", "manager@suez.local", "manager", "Head, Sales & Marketing", "Sales & Marketing", "SZ-001"],
    ["SZ-004", "Daniel Ogundipe", "staff@suez.local", "staff", "Account Executive", "Sales & Marketing", "SZ-003"],
    ["SZ-005", "Fatima Yusuf", "fatima@suez.local", "staff", "Financial Analyst", "Finance & Accounts", "SZ-001"],
    ["SZ-006", "Emeka Nwosu", "emeka@suez.local", "manager", "Head, Operations", "Operations", "SZ-001"],
    ["SZ-007", "Grace Adeyemi", "grace@suez.local", "staff", "IT Support Officer", "IT & Digital", "SZ-006"],
    ["SZ-008", "Hassan Mohammed", "hassan@suez.local", "staff", "Procurement Officer", "Operations", "SZ-006"],
    ["SZ-009", "Ifeoma Balogun", "ifeoma@suez.local", "staff", "HR Officer", "Human Resources", "SZ-002"],
    ["SZ-010", "Kunle Adebayo", "kunle@suez.local", "staff", "Business Development Officer", "Sales & Marketing", "SZ-003"],
  ];
  const userId = {};
  const pw = hashPassword("password123");
  for (const [staff, name, email, role, title, dept] of people) {
    const { rows } = await q(
      `insert into users (staff_no, full_name, email, password_hash, role, job_title, department_id, phone)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [staff, name, email, pw, role, title, deptId[dept], "+234 80" + Math.floor(10000000 + Math.random() * 89999999)],
    );
    userId[staff] = rows[0].id;
  }
  for (const [staff, , , , , , mgr] of people) {
    if (mgr) await q("update users set manager_id=$1 where id=$2", [userId[mgr], userId[staff]]);
  }
  await q("update departments set head_id=$1 where name='Human Resources'", [userId["SZ-002"]]);
  await q("update departments set head_id=$1 where name='Sales & Marketing'", [userId["SZ-003"]]);
  await q("update departments set head_id=$1 where name='Operations'", [userId["SZ-006"]]);
  await q("update departments set head_id=$1 where name='Executive'", [userId["SZ-001"]]);

  const companies = [
    ["Harmattan Logistics Ltd", "Logistics", "harmattanlogistics.com", "customer", "SZ-003", "Lagos, Nigeria", "201-500"],
    ["Zenith Foods PLC", "FMCG", "zenithfoods.com", "customer", "SZ-004", "Ibadan, Nigeria", "500+"],
    ["Cobalt Energy Partners", "Energy", "cobaltenergy.io", "prospect", "SZ-010", "Port Harcourt, Nigeria", "51-200"],
    ["Riverstone Constructions", "Construction", "riverstone.ng", "prospect", "SZ-003", "Abuja, Nigeria", "201-500"],
    ["Meridian Health Group", "Healthcare", "meridianhealth.africa", "lead", "SZ-004", "Accra, Ghana", "51-200"],
    ["Northgate Financial", "Financial Services", "northgatefinancial.com", "lead", "SZ-010", "Lagos, Nigeria", "500+"],
    ["Palmview Hotels", "Hospitality", "palmviewhotels.com", "churned", "SZ-003", "Calabar, Nigeria", "11-50"],
  ];
  const compId = {};
  for (const [name, industry, website, status, owner, address, size] of companies) {
    const { rows } = await q(
      `insert into crm_companies (name, industry, website, email, phone, address, size, status, owner_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [name, industry, website, "hello@" + website, "+234 1 " + Math.floor(2000000 + Math.random() * 7999999), address, size, status, userId[owner]],
    );
    compId[name] = rows[0].id;
  }

  const contacts = [
    ["Tunde Bakare", "Harmattan Logistics Ltd", "Chief Operating Officer", true, "SZ-003"],
    ["Amina Sule", "Harmattan Logistics Ltd", "Procurement Lead", false, "SZ-003"],
    ["Ngozi Umeh", "Zenith Foods PLC", "Head of Supply Chain", true, "SZ-004"],
    ["Segun Ojo", "Cobalt Energy Partners", "Managing Director", true, "SZ-010"],
    ["Blessing Etim", "Riverstone Constructions", "Finance Director", true, "SZ-003"],
    ["Kwame Mensah", "Meridian Health Group", "Operations Manager", true, "SZ-004"],
    ["Halima Bala", "Northgate Financial", "Vendor Manager", true, "SZ-010"],
    ["Peter Okoro", "Palmview Hotels", "General Manager", true, "SZ-003"],
  ];
  const contactId = {};
  for (const [name, company, title, primary, owner] of contacts) {
    const { rows } = await q(
      `insert into crm_contacts (company_id, full_name, job_title, email, phone, is_primary, owner_id)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [compId[company], name, title, name.toLowerCase().replace(/\s+/g, ".") + "@example.com",
        "+234 80" + Math.floor(10000000 + Math.random() * 89999999), primary, userId[owner]],
    );
    contactId[name] = rows[0].id;
  }

  const deals = [
    ["Annual fleet maintenance contract", "Harmattan Logistics Ltd", "Tunde Bakare", 42000000, "negotiation", 70, "SZ-003", 25],
    ["Cold chain expansion — phase 2", "Zenith Foods PLC", "Ngozi Umeh", 88500000, "proposal", 45, "SZ-004", 60],
    ["Offshore equipment supply", "Cobalt Energy Partners", "Segun Ojo", 156000000, "qualification", 20, "SZ-010", 90],
    ["Site facilities management", "Riverstone Constructions", "Blessing Etim", 31200000, "proposal", 50, "SZ-003", 40],
    ["Clinic equipment retrofit", "Meridian Health Group", "Kwame Mensah", 24750000, "qualification", 15, "SZ-004", 75],
    ["Branch network servicing", "Northgate Financial", "Halima Bala", 67300000, "won", 100, "SZ-010", -5],
    ["Hotel generator overhaul", "Palmview Hotels", "Peter Okoro", 12400000, "lost", 0, "SZ-003", -15],
    ["Warehouse racking supply", "Harmattan Logistics Ltd", "Amina Sule", 19800000, "won", 100, "SZ-003", -30],
  ];
  const dealId = {};
  for (const [title, company, contact, value, stage, prob, owner, close] of deals) {
    const { rows } = await q(
      `insert into crm_deals (title, company_id, contact_id, value, stage, probability, owner_id, expected_close)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [title, compId[company], contactId[contact], value, stage, prob, userId[owner], daysFromNow(close)],
    );
    dealId[title] = rows[0].id;
  }

  const acts = [
    ["call", "Follow up on revised pricing", "Annual fleet maintenance contract", 2, null],
    ["meeting", "Site visit with the supply chain team", "Cold chain expansion — phase 2", 5, null],
    ["email", "Send technical specification pack", "Offshore equipment supply", 1, null],
    ["task", "Prepare draft SLA for review", "Site facilities management", 4, null],
    ["call", "Introductory discovery call", "Clinic equipment retrofit", -3, -3],
    ["note", "Contract signed, kickoff scheduled", "Branch network servicing", -6, -6],
    ["task", "Log post-mortem on lost bid", "Hotel generator overhaul", -14, -13],
  ];
  for (const [kind, subject, deal, due, done] of acts) {
    const d = await q("select company_id, contact_id, owner_id from crm_deals where id=$1", [dealId[deal]]);
    await q(
      `insert into crm_activities (kind, subject, due_at, completed_at, company_id, contact_id, deal_id, owner_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [kind, subject, daysFromNow(due), done === null ? null : daysFromNow(done),
        d.rows[0].company_id, d.rows[0].contact_id, dealId[deal], d.rows[0].owner_id],
    );
  }

  /**
   * A funded deposit account, part drawn down.
   *
   * This is the shape the whole feature exists for: a customer pays a large sum
   * up front and then asks for goods against it, month after month, until it is
   * gone. Seeded part-spent so the balance bar, the ledger and the itemised
   * drawdowns all have something to show.
   */
  {
    const { rows: companyRows } = await q("select id, name from crm_companies order by id limit 1");
    const customer = companyRows[0];
    if (customer) {
      const { rows: depositRows } = await q(
        `insert into crm_deposits (company_id, name, currency, owner_id, low_balance_ratio, notes, created_by)
         values ($1, 'Street lighting supply 2026', 'NGN', $2, 0.10,
                 'Framework deposit. Units drawn against it on written request from their projects office.', $2)
         returning id`,
        [customer.id, userId["SZ-001"] ?? Object.values(userId)[0]],
      );
      const depositId = depositRows[0].id;
      const recorder = userId["SZ-001"] ?? Object.values(userId)[0];

      await q(
        `insert into crm_deposit_entries (deposit_id, kind, amount, occurred_on, description, reference, recorded_by)
         values ($1, 'funding', 500000000, current_date - 120, 'Opening funding — framework agreement', 'TRF/2026/0041', $2)`,
        [depositId, recorder],
      );

      const drawdowns = [
        [100, "Solar street light units — batch 1", "PO-2026-0117", [["90W all-in-one solar street light", 120, 385000]]],
        [78, "Solar street light units — batch 2", "PO-2026-0142", [["90W all-in-one solar street light", 80, 385000], ["Galvanised 6m pole", 80, 96000]]],
        [41, "Replacement batteries and controllers", "PO-2026-0163", [["LiFePO4 battery 60Ah", 45, 148000], ["MPPT controller", 45, 42000]]],
        [12, "Solar street light units — batch 3", "PO-2026-0188", [["120W all-in-one solar street light", 60, 470000]]],
      ];
      for (const [daysAgo, description, reference, lines] of drawdowns) {
        const total = lines.reduce((sum, [, qty, price]) => sum + qty * price, 0);
        const { rows: entryRows } = await q(
          `insert into crm_deposit_entries (deposit_id, kind, amount, occurred_on, description, reference, recorded_by)
           values ($1, 'drawdown', $2, current_date - $3, $4, $5, $6) returning id`,
          [depositId, -total, daysAgo, description, reference, recorder],
        );
        for (const [lineDescription, quantity, unitPrice] of lines) {
          await q(
            `insert into crm_deposit_items (entry_id, description, quantity, unit_price, line_total)
             values ($1,$2,$3,$4,$5)`,
            [entryRows[0].id, lineDescription, quantity, unitPrice, quantity * unitPrice],
          );
        }
      }
      console.log(`✓ deposit account seeded for ${customer.name}`);
    }
  }

  for (const id of Object.values(userId)) {
    await q("insert into notifications (user_id, title, body, href) values ($1,$2,$3,$4)", [
      id, "Welcome to SuezCRM", "Your sales workspace is ready. Start by reviewing the opportunity pipeline.", "/deals",
    ]);
  }

  await q(
    `insert into settings (key, value) values
       ('organisation', $1::jsonb),
       ('email', $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [
      JSON.stringify({ name: "Suez Group", short_name: "Suez", address: "14 Adeola Odeku Street, Victoria Island, Lagos", phone: "+234 1 280 4400", email: "info@suez.local", website: "https://suez.local", timezone: "Africa/Lagos", currency: "NGN", fiscal_year_start: "01-01" }),
      JSON.stringify({ host: "", port: 587, secure: false, user: "", pass: "", from_name: "SuezCRM", from_email: "no-reply@suez.local", enabled: false,
        notify_on_lead: true, notify_on_deal: false, notify_on_quote: true, notify_on_ticket: true,
        notify_on_deposit: true, notify_on_assignment: true, notify_on_security: true, notify_on_general: true }),
    ],
  );

  console.log("✓ seeded — sign in as admin@suez.local / password123");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
