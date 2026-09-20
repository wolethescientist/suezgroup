// Business rules that must not drift. No database, no session — pure arithmetic
// and policy, so these run anywhere and fail loudly when someone changes a rule.
import assert from "node:assert/strict";
import { documentTotals, lineTotal, netBookValue, outstanding, paymentStatus, round2, subtotalOf, ticketDueHours } from "../lib/money.ts";
import { hoursAreSane, mondayOf, shiftWeeks } from "../lib/weeks.ts";
import { canDeleteOwned, isAdmin, isManager, isSelfApproval, canManageProject, can, canAny, canEditMemo, isStaleSignature } from "../lib/permissions.ts";
import { BUILTIN_ROLES, CAPABILITIES } from "../lib/capabilities.ts";
import { driverKind, isLocalHost } from "../lib/db.ts";
import { defaultMailFolder, mailFolderLabel, normaliseMailFolders } from "../lib/mail-folders.ts";
import { readableImapError, readableSmtpError } from "../lib/mail-errors.ts";

/**
 * A session user. Capabilities now come from the role rather than the role name
 * itself, so fixtures carry the same list the real session would — taken from
 * BUILTIN_ROLES so the test cannot drift from what the app actually seeds.
 */
const capsFor = (role) => BUILTIN_ROLES.find((r) => r.key === role)?.caps ?? [];
const user = (id, role) => ({ id, role, capabilities: capsFor(role) });

/* ------------------------------------------------------------- money */
assert.equal(round2(0.1 + 0.2), 0.3, "float dust is rounded away");
assert.equal(lineTotal({ quantity: 2, unit_price: 5_000_000 }), 10_000_000, "a line is qty x price");

// The invoice actually raised through the UI, to the kobo.
const inv = documentTotals([
  { quantity: 2, unit_price: 5_000_000 },
  { quantity: 1, unit_price: 750_000 },
]);
assert.equal(inv.subtotal, 10_750_000, "invoice subtotal");
assert.equal(inv.tax, 806_250, "VAT at the 7.5% default");
assert.equal(inv.total, 11_556_250, "invoice total");

// The quote raised through the UI: discount comes off before VAT.
const quote = documentTotals(
  [{ quantity: 6, unit_price: 2_100_000 }, { quantity: 6, unit_price: 950_000 }],
  { discount: 500_000 },
);
assert.equal(quote.subtotal, 18_300_000, "quote subtotal");
assert.equal(quote.net, 17_800_000, "discount is deducted before tax");
assert.equal(quote.total, 19_135_000, "quote total");
assert.ok(quote.total < subtotalOf([{ quantity: 6, unit_price: 2_100_000 }, { quantity: 6, unit_price: 950_000 }]) * 1.075,
  "a discounted quote is cheaper than the same quote taxed on list price");

// A discount cannot be used to invert a document.
const silly = documentTotals([{ quantity: 1, unit_price: 1000 }], { discount: 99_999 });
assert.equal(silly.net, 0, "net is floored at zero");
assert.equal(silly.total, 0, "no negative totals");
assert.equal(silly.discount, 1000, "the recorded discount never exceeds the subtotal");

assert.equal(documentTotals([{ quantity: 1, unit_price: 100 }], { taxRate: 0 }).total, 100, "a zero rate charges no tax");

/* ------------------------------------------------- payment status */
assert.equal(paymentStatus(11_556_250, 0, "sent"), "sent", "nothing received leaves the status alone");
assert.equal(paymentStatus(11_556_250, 5_000_000, "sent"), "part_paid", "a partial payment is part_paid");
assert.equal(paymentStatus(11_556_250, 11_556_250, "part_paid"), "paid", "paying the balance closes it");
assert.equal(paymentStatus(11_556_250, 12_000_000, "sent"), "paid", "an overpayment still reads as paid");
assert.equal(paymentStatus(100, 100, "void"), "void", "a void invoice is never resurrected by a payment");
assert.equal(outstanding(11_556_250, 5_000_000), 6_556_250, "outstanding is total less paid");
assert.equal(outstanding(100, 500), 0, "outstanding never goes negative");

/* ------------------------------------------------------ depreciation */
const asOf = new Date("2026-09-07T00:00:00Z");

// Exactly half a 4-year life: 2 of the 365.25-day years the calculation uses.
const halfLife = new Date(Date.UTC(2024, 8, 7) + 2 * 31_557_600_000);
assert.equal(netBookValue(800_000, "2024-09-07", 4, halfLife), 400_000, "half the life is half the value");
assert.equal(netBookValue(800_000, "2024-09-07", 4, new Date("2024-09-07T00:00:00Z")), 800_000, "on the day of purchase it is worth cost");

// The Hilux from the asset register: 42m over 8 years, bought 15 Mar 2024.
const hilux = netBookValue(42_000_000, "2024-03-15", 8, asOf);
assert.ok(hilux > 28_900_000 && hilux < 29_000_000, `Hilux NBV in the expected band, got ${hilux}`);
assert.ok(hilux < 42_000_000, "and below cost");
assert.equal(netBookValue(1_000_000, "2010-01-01", 5, asOf), 0, "fully depreciated is floored at zero, not negative");
assert.equal(netBookValue(1_000_000, "2030-01-01", 5, asOf), 1_000_000, "a future purchase is carried at cost");
assert.equal(netBookValue(1_000_000, null, 5, asOf), 1_000_000, "no purchase date means no write-down");
assert.equal(netBookValue(1_000_000, "2024-01-01", 0, asOf), 1_000_000, "a zero life does not divide by zero");

/* ------------------------------------------------------------ tickets */
assert.equal(ticketDueHours("urgent"), 4, "urgent tickets get 4 hours");
assert.equal(ticketDueHours("high"), 24, "high gets a working day");
assert.equal(ticketDueHours("anything else"), 72, "everything else gets three days");

/* -------------------------------------------------------------- weeks */
assert.equal(mondayOf("2026-09-07"), "2026-09-07", "a Monday is its own week start");
assert.equal(mondayOf("2026-09-13"), "2026-09-07", "Sunday belongs to the week that began on Monday");
assert.equal(mondayOf("2026-09-08"), "2026-09-07", "a Tuesday rolls back to Monday");
assert.equal(shiftWeeks("2026-09-07", -1), "2026-08-31", "previous week");
assert.equal(shiftWeeks("2026-09-07", 1), "2026-09-14", "next week");
assert.throws(() => mondayOf("not-a-date"), "a malformed date is rejected rather than silently wrong");
assert.ok(hoursAreSane([8, 8, 7.5, 8, 6]), "a normal week is accepted");
assert.ok(!hoursAreSane([25]), "more than 24 hours in a day is a typo");
assert.ok(!hoursAreSane([-1]), "negative hours are rejected");

/* --------------------------------------------------------- permissions */
const admin = user(1, "admin"), hr = user(2, "hr"), manager = user(3, "manager"), staff = user(4, "staff");
const finance = user(5, "finance"), procurement = user(6, "procurement");
assert.ok(isAdmin(admin), "an administrator configures the system");
assert.ok(!isAdmin(hr), "HR administers people, not the role model");
assert.ok(!isAdmin(manager) && !isAdmin(staff), "managers and staff do not");
assert.ok(isManager(manager) && isManager(admin) && isManager(hr), "managers, HR and admins all manage");
assert.ok(!isManager(staff), "staff do not manage");

/* ------------------------------------------------------- capabilities */
assert.ok(can(admin, "roles.manage"), "an administrator can manage roles");
assert.ok(!can(staff, "roles.manage"), "staff cannot");
assert.ok(!can(null, "roles.manage"), "nobody is not somebody");
assert.ok(canAny(finance, "invoice.manage", "roles.manage"), "any one capability is enough");
assert.ok(!canAny(staff, "invoice.manage", "budget.manage"), "holding none of them is not");

// The controls that a role must never be able to hand out.
assert.ok(!can(finance, "people.manage"), "finance does not administer staff records");
assert.ok(!can(procurement, "invoice.manage"), "procurement does not raise invoices");
assert.ok(!can(hr, "invoice.manage"), "HR does not raise invoices");
/**
 * Staff hold exactly one capability, and it is not an elevated one.
 *
 * `request.route_department` lets somebody send a request to a department queue
 * instead of to a named person — the whole point of which is that the person on
 * the support line, who is "staff", should not have to walk to the IT desk and
 * ask whoever looks free. It grants no reach over anybody's records.
 */
assert.deepEqual(capsFor("staff").sort(), ["document.route", "request.route_department"],
  "staff may queue a request and send their own draft up for signature, and hold nothing else");
for (const cap of capsFor("staff")) {
  assert.ok(!/^(people|roles|settings|audit|invoice|budget|expense)\./.test(cap),
    `staff must not hold ${cap}`);
}
assert.equal(capsFor("admin").length, CAPABILITIES.length, "the administrator role holds everything");

assert.ok(canDeleteOwned(staff, 4), "you may delete a record you own");
assert.ok(!canDeleteOwned(staff, 9), "you may not delete someone else's");
assert.ok(canDeleteOwned(manager, 9), "a manager may");
assert.ok(!canDeleteOwned(staff, null), "an unowned record is not open season for staff");
assert.ok(canDeleteOwned(admin, null), "but an administrator can clear it");

assert.ok(isSelfApproval(admin, 1), "approving your own submission is self-approval");
assert.ok(!isSelfApproval(admin, 2), "approving someone else's is not");

const project = { manager_id: 6 };
assert.ok(canManageProject(user(6, "staff"), project), "the project manager manages it");
assert.ok(canManageProject(staff, project, true), "so does someone on the team");
assert.ok(!canManageProject(staff, project, false), "an unrelated employee does not");
assert.ok(canManageProject(admin, project, false), "an administrator always can");

/* --------------------------------------------- database driver selection */
// The system must run on the dockerised Postgres locally and on Neon when
// deployed, with the connection string as the only difference. These are the
// real shapes of both, so a change to the matcher fails here.
const NEON = [
  "postgresql://u:p@ep-cool-darkness-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  "postgres://u:p@ep-still-river-a1b2c3.us-east-2.aws.neon.tech/main?sslmode=require&channel_binding=require",
  "postgresql://u:p@ep-x.neon.build/db",
];
const POSTGRES = [
  "postgresql://suez:suez@localhost:5433/suez",
  "postgresql://suez:suez@127.0.0.1:5433/suez",
  "postgresql://suez:suez@host.docker.internal:5433/suez",
  "postgresql://u:p@db.internal.suezelectric.com:5432/suez?sslmode=require",
  "postgresql://u:p@rds.eu-west-1.amazonaws.com:5432/suez",
];
for (const url of NEON) assert.equal(driverKind(url), "neon", `Neon URL should use the Neon driver: ${url}`);
for (const url of POSTGRES) assert.equal(driverKind(url), "postgres", `non-Neon URL should use node-postgres: ${url}`);

// A database merely *named* neon, or a user called neon, is not a Neon host.
assert.equal(driverKind("postgresql://neon:p@db.example.com:5432/neon"), "postgres", "the hostname decides, not the user or database name");
assert.equal(driverKind("postgresql://u:p@neon.tech.example.com/db"), "postgres", "a lookalike suffix is not a Neon host");

// TLS: loopback needs none, everything else does.
assert.ok(isLocalHost("postgresql://suez:suez@localhost:5433/suez"), "localhost is local");
assert.ok(isLocalHost("postgresql://suez:suez@127.0.0.1:5433/suez"), "loopback is local");
assert.ok(!isLocalHost("postgresql://u:p@db.internal.suezelectric.com:5432/suez"), "a remote host is not");
assert.ok(!isLocalHost(NEON[0]), "Neon is not local");

/* ---------------------------------------------- IMAP folder discovery */
const imapFolders = normaliseMailFolders([
  { path: "Projects/Delta", name: "Delta", delimiter: "/", subscribed: true, flags: new Set() },
  { path: "[Gmail]", name: "[Gmail]", delimiter: "/", subscribed: true, flags: new Set(["\\Noselect"]) },
  { path: "[Gmail]/Sent Mail", name: "Sent Mail", delimiter: "/", specialUse: "\\Sent", subscribed: true, flags: new Set() },
  { path: " Client folders ", name: " Client folders ", delimiter: "/", subscribed: false, flags: new Set() },
  { path: "INBOX", name: "INBOX", delimiter: "/", subscribed: true, flags: new Set() },
  { path: "Projects/Delta", name: "duplicate", delimiter: "/", subscribed: true, flags: new Set() },
]);
assert.equal(imapFolders.length, 5, "duplicate LIST rows are collapsed by exact provider path");
assert.equal(defaultMailFolder(imapFolders)?.path, "INBOX", "the advertised inbox is the default folder");
assert.equal(imapFolders.find((f) => f.path === "[Gmail]")?.selectable, false, "\\Noselect hierarchy nodes cannot be opened");
const gmailSent = imapFolders.find((f) => f.special_use === "\\Sent");
assert.equal(gmailSent?.path, "[Gmail]/Sent Mail", "provider paths are preserved verbatim for IMAP SELECT");
assert.equal(mailFolderLabel(gmailSent), "Sent", "special-use metadata supplies a friendly label without replacing the path");
assert.ok(imapFolders.some((f) => f.path === "Projects/Delta"), "custom nested folders are retained");
assert.ok(imapFolders.some((f) => f.path === " Client folders "), "even unusual provider paths are preserved byte-for-byte");
assert.match(
  readableImapError(
    { message: "Command failed", response: "3 NO [AUTHENTICATIONFAILED] Invalid credentials(Failure)", serverResponseCode: "AUTHENTICATIONFAILED" },
    "imap.zoho.com",
  ),
  /Zoho rejected.*imappro\.zoho\.com.*app-specific password/,
  "Zoho authentication failures explain the correct organisation endpoint and app password",
);
assert.equal(
  readableImapError({ message: "Command failed", response: "4 NO [UNAVAILABLE] Server maintenance" }),
  "IMAP server response: [UNAVAILABLE] Server maintenance",
  "a useful server response replaces ImapFlow's generic command failure",
);
assert.match(
  readableSmtpError({ message: "tls_validate_record_header:wrong version number" }),
  /port 465 with Implicit TLS.*port 587 with Implicit TLS disabled/,
  "a TLS-mode mismatch explains both valid SMTP submission combinations",
);

/* ------------------------------------------------ who may edit a document */

// Editing a published document issues a revision that recipients are asked to
// re-sign, so the same authority gates both. An archived document is a closed
// record: no capability reopens it.
const docAuthor = { id: 5, capabilities: [] };
const docStranger = { id: 6, capabilities: [] };
const docIssuer = { id: 7, capabilities: ["memo.publish.policy"] };
const docDraft = { author_id: 5, status: "draft" };
const docPublished = { author_id: 5, status: "published" };
const docArchived = { author_id: 5, status: "archived" };

assert.ok(canEditMemo(docDraft, docAuthor), "the author may correct their own draft");
assert.ok(!canEditMemo(docDraft, docStranger), "a colleague may not edit someone else's draft");
assert.ok(canEditMemo(docDraft, docIssuer), "whoever may issue formal documents may edit one");
assert.ok(canEditMemo(docPublished, docAuthor), "the author may revise what they issued");
assert.ok(!canEditMemo(docPublished, docStranger), "a recipient may not rewrite a document they were sent");
assert.ok(!canEditMemo(docArchived, docAuthor), "an archived document is closed even to its author");
assert.ok(!canEditMemo(docArchived, docIssuer), "no capability reopens an archived document");

// A signature is evidence only while the wording it was given against still stands.
assert.ok(!isStaleSignature(1, 1), "a signature against the current version is current");
assert.ok(isStaleSignature(1, 2), "a signature against v1 is stale once v2 is issued");
assert.ok(!isStaleSignature(null, 2), "an unsigned recipient is not a stale signature");
assert.ok(!isStaleSignature(3, 2), "a version ahead of the document is not treated as stale");

console.log("✓ unit: money, weeks, permissions, driver selection, IMAP folders and errors");
