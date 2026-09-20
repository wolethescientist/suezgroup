// Applies db/schema.sql, and with --seed loads demo data.
//   node db/migrate.mjs [--seed]
//
// SuezERP is a standalone system with its own database — its own
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
   * This runs on every migrate, not just --seed, because a new capability added
   * in code has to reach the built-in roles somehow. It only ever inserts, so a
   * capability an administrator has deliberately removed from a role stays
   * removed — `roles_seeded` records which roles have had their initial grant.
   */
  for (const role of BUILTIN_ROLES) {
    const { rows } = await q("select seeded_at from roles where key = $1", [role.key]);
    if (rows[0]?.seeded_at) continue;
    for (const cap of role.caps) {
      await q(
        "insert into role_permissions (role_key, capability) values ($1,$2) on conflict do nothing",
        [role.key, cap],
      );
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
   * release could ship "Receive weekly and monthly reports" and HR would not
   * hold it, on every database except a brand new one.
   *
   * So the set of capability keys the code has ever offered is remembered.
   * Anything not in it is new, and new capabilities are granted to the built-in
   * roles that list them — once. Removing one afterwards still sticks, because
   * the key is by then remembered and will not be granted again.
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

  // Capabilities that no longer exist in code should not linger on a role.
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
    ["SZ-005", "Fatima Yusuf", "fatima@suez.local", "finance", "Financial Analyst", "Finance & Accounts", "SZ-001"],
    ["SZ-006", "Emeka Nwosu", "emeka@suez.local", "manager", "Head, Operations", "Operations", "SZ-001"],
    ["SZ-007", "Grace Adeyemi", "grace@suez.local", "staff", "IT Support Officer", "IT & Digital", "SZ-006"],
    ["SZ-008", "Hassan Mohammed", "hassan@suez.local", "procurement", "Procurement Officer", "Operations", "SZ-006"],
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

  // `accrues` marks the types that are a balance an employee draws down. The
  // event-triggered ones (maternity, sick, study...) are paid, but they are not
  // a balance — summing them all produced a nonsense "155 days remaining".
  const types = [
    ["Annual Leave", 21, "#6366f1", true],
    ["Sick Leave", 10, "#ef4444", false],
    ["Casual Leave", 5, "#f59e0b", true],
    ["Maternity Leave", 90, "#ec4899", false],
    ["Paternity Leave", 10, "#0ea5e9", false],
    ["Study Leave", 14, "#14b8a6", false],
    ["Compassionate Leave", 5, "#8b5cf6", false],
  ];
  const typeId = {};
  for (const [name, days, color, accrues] of types) {
    const { rows } = await q(
      "insert into leave_types (name, default_days, color, accrues) values ($1,$2,$3,$4) on conflict (name) do update set default_days=excluded.default_days, accrues=excluded.accrues returning id",
      [name, days, color, accrues],
    );
    typeId[name] = rows[0].id;
  }

  const year = new Date().getFullYear();
  for (const id of Object.values(userId)) {
    for (const [name, days] of types) {
      await q(
        "insert into leave_balances (user_id, leave_type_id, year, entitled, used) values ($1,$2,$3,$4,0) on conflict do nothing",
        [id, typeId[name], year, days],
      );
    }
  }

  const memos = [
    ["circular", "2026 Half-Year Performance Review Cycle", "All staff are required to complete their self-assessment forms on or before the 15th of next month. Line managers will schedule one-on-one review sessions thereafter. Kindly treat as important.", "SZ-002", "high", "all", true],
    ["memo", "Revised Expense Claim Procedure", "Effective immediately, all expense claims above ₦250,000 require dual approval and must carry the original receipt. The portal enforces both: a claim over the threshold cannot be approved without a receipt attached, and needs a second, different approver.", "SZ-005", "normal", "all", true],
    ["circular", "Public Holiday Notice", "Please be informed that the office will be closed on the upcoming public holiday. Essential Operations staff on the duty roster should liaise with their supervisors.", "SZ-002", "normal", "all", false],
    ["circular", "Welcome to SuezERP", "The new ERP workspace is ready for finance, people, projects, procurement and internal operations. Legacy spreadsheets will be retired in phases.", "SZ-003", "normal", "department", false],
    ["policy", "Information Security Policy v3", "Multi-factor authentication is now mandatory on all company accounts. Do not share credentials over chat or email. Report suspected phishing to IT & Digital immediately.", "SZ-007", "urgent", "all", true],
  ];
  for (const [kind, title, body, author, priority, audience, ack] of memos) {
    const { rows } = await q(
      `insert into memos (kind, title, body, author_id, priority, audience, department_id, requires_ack, status, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'published', now() - (random()*interval '20 days')) returning id`,
      [kind, title, body, userId[author], priority, audience, audience === "department" ? deptId["Sales & Marketing"] : null, ack],
    );
    const targets = audience === "department"
      ? (await q("select id from users where department_id=$1", [deptId["Sales & Marketing"]])).rows
      : (await q("select id from users")).rows;
    for (const t of targets) {
      await q(
        `insert into memo_recipients (memo_id, user_id, read_at, acknowledged_at)
         values ($1,$2, case when random() > 0.4 then now() end, case when $3 and random() > 0.7 then now() end)
         on conflict do nothing`,
        [rows[0].id, t.id, ack],
      );
    }
  }

  const leaves = [
    ["SZ-004", "Annual Leave", 12, 18, 5, "Family vacation.", "pending", null],
    ["SZ-005", "Sick Leave", -6, -4, 3, "Medical advice to rest, report attached.", "approved", "SZ-001"],
    ["SZ-007", "Casual Leave", 3, 3, 1, "Personal errand at the bank.", "pending", null],
    ["SZ-009", "Study Leave", 30, 40, 9, "Professional certification examination.", "approved", "SZ-002"],
    ["SZ-010", "Annual Leave", -20, -10, 8, "Annual break.", "approved", "SZ-003"],
    ["SZ-008", "Compassionate Leave", -2, 0, 3, "Bereavement in the family.", "rejected", "SZ-006"],
  ];
  for (const [staff, type, from, to, days, reason, status, approver] of leaves) {
    await q(
      `insert into leave_requests (user_id, leave_type_id, start_date, end_date, days, reason, status, approver_id, decided_at, decision_note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [userId[staff], typeId[type], daysFromNow(from), daysFromNow(to), days, reason, status,
        approver ? userId[approver] : null, status === "pending" ? null : new Date(),
        status === "rejected" ? "Insufficient handover cover for that period. Please re-apply for next week." : status === "approved" ? "Approved. Enjoy your break." : null],
    );
    if (status === "approved") {
      await q("update leave_balances set used = used + $1 where user_id=$2 and leave_type_id=$3 and year=$4",
        [days, userId[staff], typeId[type], year]);
    }
  }

  const reqs = [
    ["Signed copy of the Q2 management accounts", "Please share the signed PDF of the Q2 management accounts for the board pack.", "document", "SZ-001", "SZ-005", "high", 3, "in_progress"],
    ["Laptop replacement for new hire", "New Account Executive resumes on Monday and needs a configured laptop and email account.", "it_support", "SZ-003", "SZ-007", "urgent", 2, "pending"],
    ["Employment confirmation letter", "Kindly issue an employment confirmation letter addressed to my bank for a loan application.", "hr", "SZ-004", "SZ-002", "normal", 5, "completed"],
    ["Three quotes for office generator servicing", "Procurement to obtain and attach three competitive quotes before approval.", "procurement", "SZ-006", "SZ-008", "normal", 7, "awaiting_info"],
    ["Approval for client entertainment budget", "Requesting approval of ₦450,000 for the client appreciation dinner next month.", "approval", "SZ-010", "SZ-003", "high", 4, "pending"],
    ["Updated organogram for the intranet", "Need the current organogram in editable format for the staff handbook refresh.", "document", "SZ-009", "SZ-002", "low", 10, "pending"],
  ];
  for (const [title, desc, cat, from, to, priority, due, status] of reqs) {
    const { rows } = await q(
      `insert into workflow_requests (title, description, category, requester_id, assignee_id, priority, due_date, status, completed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [title, desc, cat, userId[from], userId[to], priority, daysFromNow(due), status, status === "completed" ? new Date() : null],
    );
    if (status !== "pending") {
      await q("insert into workflow_comments (request_id, user_id, body) values ($1,$2,$3)", [
        rows[0].id, userId[to],
        status === "completed" ? "Done — the letter has been signed and sent to your email." :
        status === "awaiting_info" ? "Two quotes received so far. Waiting on the third vendor." :
        "Working on this now, will revert before the due date.",
      ]);
    }
  }

  const convos = [
    [["SZ-001", "SZ-003"], null, [["SZ-001", "Chidinma, can we review the Lagos pipeline before Friday's board call?"], ["SZ-003", "Yes sir. I'll send the updated forecast by tomorrow morning."], ["SZ-001", "Perfect, thank you."]]],
    [["SZ-002", "SZ-004"], null, [["SZ-004", "Good morning ma, any update on my leave request?"], ["SZ-002", "It's with your line manager for approval. I'll follow up today."]]],
    [["SZ-003", "SZ-004", "SZ-010"], "Sales — Weekly Sync", [["SZ-003", "Team, weekly sync moved to 10am Tuesdays."], ["SZ-010", "Noted."], ["SZ-004", "Works for me."]]],
    [["SZ-006", "SZ-008"], null, [["SZ-006", "Hassan, please prioritise the generator servicing quotes."], ["SZ-008", "On it."]]],
  ];
  for (const [members, subject, msgs] of convos) {
    const { rows } = await q("insert into conversations (subject, is_group, created_by) values ($1,$2,$3) returning id", [
      subject, members.length > 2, userId[members[0]],
    ]);
    for (const m of members) {
      await q("insert into conversation_members (conversation_id, user_id, last_read_at) values ($1,$2,now()) on conflict do nothing", [rows[0].id, userId[m]]);
    }
    for (const [sender, body] of msgs) {
      await q("insert into messages (conversation_id, sender_id, body) values ($1,$2,$3)", [rows[0].id, userId[sender], body]);
    }
  }


  /**
   * Attendance for the last fortnight of working days.
   *
   * Times are jittered around 08:00 and 17:00 so the register looks like a
   * register rather than a fixture, and one person is left clocked in today so
   * the "still in" state on HR's page is visible without waiting for anybody.
   */
  {
    const staff = Object.values(userId);
    for (let back = 14; back >= 0; back--) {
      const day = new Date();
      day.setDate(day.getDate() - back);
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const date = day.toISOString().slice(0, 10);

      for (const id of staff) {
        if (Math.random() < 0.12) continue; // absences, leave, site visits
        const inMinutes = 7 * 60 + 40 + Math.floor(Math.random() * 45);
        const outMinutes = 16 * 60 + 45 + Math.floor(Math.random() * 60);
        const stillIn = back === 0 && id === staff[6];
        await q(
          `insert into attendance_entries (user_id, work_date, clocked_in_at, clocked_out_at, minutes)
           values ($1, $2::date, $2::date + ($3 || ' minutes')::interval,
                   case when $5 then null else $2::date + ($4 || ' minutes')::interval end,
                   case when $5 then null else $4 - $3 end)`,
          [id, date, inMinutes, outMinutes, stillIn],
        );
      }
    }
  }

  /**
   * Weekly reports for the week just gone — some in, some not, so the
   * "still outstanding" list on HR's page has something in it.
   */
  {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7);
    const periodStart = monday.toISOString().slice(0, 10);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const periodEnd = sunday.toISOString().slice(0, 10);

    const submitted = [
      ["SZ-003", "Sales & Marketing — week in review", "Three proposals out, one signed. Lagos pipeline is holding."],
      ["SZ-006", "Operations — week in review", "Generator servicing quotes in. Warehouse stock count completed."],
      ["SZ-005", "Finance — week in review", "Q2 management accounts drafted, awaiting the MD's review."],
      ["SZ-007", "IT & Digital — week in review", "Two laptops rebuilt. Phishing attempt reported and blocked."],
    ];
    for (const [staff, title, summary] of submitted) {
      await q(
        `insert into staff_reports (kind, period_start, period_end, title, summary, user_id, department_id, status, submitted_at)
         select 'weekly', $1::date, $2::date, $3, $4, $5, u.department_id, 'submitted', now() - interval '2 days'
           from users u where u.id = $5
         on conflict do nothing`,
        [periodStart, periodEnd, title, summary, userId[staff]],
      );
    }
  }

  for (const id of Object.values(userId)) {
    await q("insert into notifications (user_id, title, body, href) values ($1,$2,$3,$4)", [
      id, "Welcome to SuezERP", "Your workspace is ready. Start by reviewing the circulars addressed to you.", "/memos",
    ]);
  }

  await q(
    `insert into settings (key, value) values
       ('organisation', $1::jsonb),
       ('email', $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [
      JSON.stringify({ name: "Suez Group", short_name: "Suez", address: "14 Adeola Odeku Street, Victoria Island, Lagos", phone: "+234 1 280 4400", email: "info@suez.local", website: "https://suez.local", timezone: "Africa/Lagos", currency: "NGN", fiscal_year_start: "01-01" }),
      JSON.stringify({ host: "", port: 587, secure: false, user: "", pass: "", from_name: "SuezERP", from_email: "no-reply@suez.local", enabled: false, notify_on_memo: true, notify_on_leave: true, notify_on_request: true }),
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
