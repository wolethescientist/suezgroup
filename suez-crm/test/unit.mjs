// CRM business rules that must not drift. These are pure and need no database.
import assert from "node:assert/strict";
import { documentTotals, ticketDueHours } from "../lib/money.ts";
import { canDeleteOwned, canEditOwned, isManager, can, canAny } from "../lib/permissions.ts";
import { BUILTIN_ROLES, CAPABILITIES } from "../lib/capabilities.ts";
import { scoreLead, scoreBand } from "../lib/scoring.ts";
import { driverKind, isLocalHost } from "../lib/db.ts";

const quote = documentTotals(
  [{ quantity: 6, unit_price: 2_100_000 }, { quantity: 6, unit_price: 950_000 }],
  { discount: 500_000 },
);
assert.equal(quote.subtotal, 18_300_000, "quote subtotal");
assert.equal(quote.net, 17_800_000, "discount is deducted before VAT");
assert.equal(quote.total, 19_135_000, "quote total includes VAT");
assert.equal(documentTotals([{ quantity: 1, unit_price: 1000 }], { discount: 99_999 }).total, 0, "a discount cannot make a quote negative");

assert.equal(ticketDueHours("urgent"), 4, "urgent tickets get a four-hour deadline");
assert.equal(ticketDueHours("high"), 24, "high-priority tickets get one day");
assert.equal(ticketDueHours("normal"), 72, "normal tickets get three days");

/**
 * Capabilities come from the role rather than the role name, so fixtures carry
 * the same list a real session would — taken from BUILTIN_ROLES so this cannot
 * drift from what the app actually seeds.
 */
const capsFor = (role) => BUILTIN_ROLES.find((r) => r.key === role)?.caps ?? [];
const user = (id, role) => ({ id, role, capabilities: capsFor(role) });

const staff = user(4, "staff");
const manager = user(3, "manager");
const admin = user(1, "admin");

assert.ok(canDeleteOwned(staff, 4), "staff may delete records they own");
assert.ok(!canDeleteOwned(staff, 9), "staff may not delete another owner's records");
assert.ok(canDeleteOwned(manager, 9), "managers may delete team records");
assert.ok(isManager(manager) && !isManager(staff), "manager access remains distinct from staff access");

/* ------------------------------------------------------- capabilities */
assert.ok(can(admin, "roles.manage"), "an administrator can manage roles");
assert.ok(!can(manager, "roles.manage"), "a sales manager cannot");
assert.ok(!can(null, "roles.manage"), "nobody is not somebody");
assert.ok(canAny(manager, "record.delete", "roles.manage"), "any one capability is enough");
assert.ok(!canAny(staff, "record.delete", "record.reassign"), "holding none of them is not");

// Ownership is the CRM's main control, and it survives however roles are set.
assert.ok(canEditOwned(staff, 4), "a rep edits their own record");
assert.ok(!canEditOwned(staff, 9), "a rep does not edit a colleague's");
assert.ok(canEditOwned(manager, 9), "a manager works across the team");
assert.ok(canEditOwned(staff, null), "an unowned record is workable by anyone");
assert.ok(!canDeleteOwned(staff, null), "but deleting an unowned record is not open season");

assert.equal(capsFor("admin").length, CAPABILITIES.length, "the administrator role holds everything");
assert.deepEqual(capsFor("staff"), ["report.view"], "sales get reports and nothing wider");
// The pipeline board is shared, so the totals are too. What is gated is the
// table that ranks colleagues by won value.
assert.ok(can(staff, "report.view"), "a rep can open reports");
assert.ok(!can(staff, "report.view_owners"), "but not the table comparing colleagues");
assert.ok(can(manager, "report.view_owners"), "a manager can compare their team");

assert.equal(
  scoreLead({ email: "a@b.com", phone: "080", company_name: "GTB", job_title: "Managing Director", source: "referral", estimated_value: 75_000_000 }),
  100,
  "a complete referred lead is capped at 100",
);
const warm = scoreLead({ email: "c@d.com", company_name: "Kano Steel", job_title: "Procurement Manager", source: "website", estimated_value: 4_500_000 });
const cold = scoreLead({ company_name: "Independent", source: "cold_call" });
assert.equal(warm, 67, "the published lead weights produce the expected score");
assert.equal(cold, 13, "a bare cold-call lead remains cold");
assert.equal(scoreLead({}), 0, "an empty lead scores zero");
assert.equal(scoreBand(70), "hot");
assert.equal(scoreBand(69), "warm");
assert.equal(scoreBand(39), "cold");

const neon = "postgresql://u:p@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const local = "postgresql://suez:suez@localhost:5434/crm";
assert.equal(driverKind(neon), "neon");
assert.equal(driverKind(local), "postgres");
assert.ok(isLocalHost(local));
assert.ok(!isLocalHost(neon));
assert.equal(driverKind("postgresql://u:p@neon.tech.example.com/crm"), "postgres", "lookalike hostnames are not Neon");

console.log("✓ unit: quotes, tickets, permissions, scoring, driver selection");
