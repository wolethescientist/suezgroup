// Pure logic worth breaking a build over: passwords, session tokens, working-day
// counts, storage keys, and the image data-URL trust boundary.
//   node test.mjs
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { readToken, signToken } from "../lib/token.ts";
import { workingDays } from "../lib/format.ts";
import { objectPath, storageEnabled } from "../lib/storage.ts";
import { fileRef, parseImageDataUrl } from "../lib/images.ts";
import { csvField, toCsv } from "../lib/csv.ts";
import { seal, open as unseal, isSealed } from "../lib/secretbox.ts";
import { autoMap, money as sheetMoney, date as sheetDate, email as sheetEmail, oneOf } from "../lib/spreadsheet.ts";
import { scoreLead, scoreBand } from "../lib/scoring.ts";

// --- passwords ---------------------------------------------------------------
const stored = hashPassword("correct horse battery staple");
assert.ok(verifyPassword("correct horse battery staple", stored), "right password must verify");
assert.ok(!verifyPassword("wrong password", stored), "wrong password must fail");
assert.notEqual(hashPassword("same"), hashPassword("same"), "salts must differ per hash");
assert.ok(!verifyPassword("x", "notahash"), "malformed hash must fail, not throw");

// --- session tokens ---------------------------------------------------------
const SECRET = "test-secret";
const good = signToken({ id: 7, exp: Date.now() + 60_000 }, SECRET);
assert.equal(readToken(good, SECRET)?.id, 7, "valid token round-trips");
assert.equal(readToken(good, "other-secret"), null, "token signed elsewhere is rejected");
assert.equal(readToken(signToken({ id: 7, exp: Date.now() - 1 }, SECRET), SECRET), null, "expired token is rejected");
// Flip the last character to something it definitely was not, so this never no-ops.
const tampered = good.slice(0, -1) + (good.at(-1) === "A" ? "B" : "A");
assert.equal(readToken(tampered, SECRET), null, "tampered mac is rejected");
assert.equal(
  readToken(Buffer.from(JSON.stringify({ id: 1, exp: Date.now() + 60_000 })).toString("base64url") + ".", SECRET),
  null,
  "unsigned payload is rejected",
);
assert.equal(readToken(undefined, SECRET), null, "missing cookie is not a session");

// --- working days -----------------------------------------------------------
assert.equal(workingDays("2026-08-03", "2026-08-07"), 5, "Mon–Fri is 5 days");
assert.equal(workingDays("2026-08-03", "2026-08-09"), 5, "the weekend does not count");
assert.equal(workingDays("2026-08-08", "2026-08-09"), 0, "a weekend alone is 0 days");
assert.equal(workingDays("2026-08-03", "2026-08-03"), 1, "a single weekday is inclusive");
assert.equal(workingDays("2026-08-07", "2026-08-03"), 0, "a reversed range is 0, never negative");
assert.equal(workingDays("not-a-date", "2026-08-03"), 0, "garbage input is 0, not NaN");

// --- storage object keys -----------------------------------------------------
// A filename comes straight from the browser, so it must not be able to escape
// the dated folder or smuggle a second path segment in.
for (const nasty of ["../../etc/passwd", "a/b/c.pdf", "..\\..\\win.ini", "  spaced  .PDF", "naïve—résumé.docx"]) {
  const path = objectPath(nasty);
  assert.equal(path.split("/").length, 3, `"${nasty}" must yield exactly year/month/file`);
  assert.match(path, /^\d{4}\/\d{2}\/[0-9a-f-]{36}-/, `"${nasty}" must be prefixed with date and uuid`);
  assert.ok(!path.split("/")[2].includes("\\"), `"${nasty}" must not keep backslashes`);
}
assert.notEqual(objectPath("a.pdf"), objectPath("a.pdf"), "two uploads of one name get distinct keys");
assert.ok(objectPath("Quarterly Report.pdf").endsWith("Quarterly Report.pdf"), "readable tail is preserved");

// --- avatar / signature data URLs -------------------------------------------
// The string comes from the browser, so this is a trust boundary.
const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const png = parseImageDataUrl(onePixelPng);
assert.equal(png.mime, "image/png");
assert.equal(png.ext, "png");
assert.ok(png.bytes.byteLength > 0, "bytes are decoded");
assert.equal(parseImageDataUrl(onePixelPng.replace("image/png", "image/jpeg")).ext, "jpg", "jpeg maps to a .jpg tail");

for (const [bad, why] of [
  ["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "SVG is rejected — inline SVG from our origin is stored XSS"],
  ["data:text/html;base64,PHNjcmlwdD4x", "text/html is rejected"],
  ["data:application/pdf;base64,JVBERi0=", "a PDF is not an avatar"],
  ["https://evil.example/x.png", "a remote URL is not a data URL"],
  ["data:image/png;base64,", "an empty payload is rejected"],
  ["javascript:alert(1)", "a javascript: URL is rejected"],
  ["", "an empty string is rejected"],
]) {
  assert.throws(() => parseImageDataUrl(bad), Error, why);
}
assert.throws(
  () => parseImageDataUrl(`data:image/png;base64,${"A".repeat(6_000_000)}`),
  /under 4 MB/,
  "oversize images are rejected with a readable message",
);

assert.equal(fileRef(42), "/api/files/42", "user rows reference files by route path");

// --- CSV export --------------------------------------------------------------
assert.equal(csvField("plain"), "plain");
assert.equal(csvField(null), "", "null is an empty cell, not the text 'null'");
assert.equal(csvField(undefined), "");
assert.equal(csvField(0), "0", "zero is not blank");
assert.equal(csvField(false), "false");
assert.equal(csvField('He said "no"'), '"He said ""no"""', "quotes are doubled and the field wrapped");
assert.equal(csvField("Lagos, Nigeria"), '"Lagos, Nigeria"', "commas force quoting");
assert.equal(csvField("line1\nline2"), '"line1\nline2"', "newlines force quoting");
assert.equal(csvField(new Date("2026-07-30T09:15:00Z")), "2026-07-30T09:15:00.000Z");

// Formula injection: a reason field an employee typed must never execute in Excel.
for (const payload of ["=1+1", "+1", "-1", "@SUM(A1)", "=HYPERLINK(\"http://evil\",\"click\")", "\t=cmd"]) {
  const out = csvField(payload);
  assert.ok(out.replace(/^"/, "").startsWith("'"), `"${payload}" must be defused with a leading apostrophe`);
}
// No CSV metacharacters here, so it is defused but needs no quoting.
assert.equal(csvField("=cmd|'/c calc'!A1"), "'=cmd|'/c calc'!A1");
// With a comma in it, both rules apply.
assert.equal(csvField("=cmd,calc"), `"'=cmd,calc"`, "defused and quoted together");
assert.ok(!csvField("a=b").startsWith("'"), "an equals sign mid-value is harmless and left alone");

const csv = toCsv(
  [
    { key: "name", label: "Name" },
    { key: "days", label: "Days" },
  ],
  [
    { name: "Fatima Yusuf", days: 3 },
    { name: "=cmd", days: null },
  ],
);
assert.ok(csv.startsWith("﻿"), "a BOM so Excel reads UTF-8");
assert.equal(csv.split("\r\n")[0], "﻿Name,Days", "header row comes from the labels");
assert.equal(csv.split("\r\n")[2], "'=cmd,", "rows are defused and null cells stay empty");
assert.ok(csv.endsWith("\r\n"), "trailing CRLF");

assert.equal(fileRef(42), "/api/files/42", "user rows reference files by route path");

delete process.env.SUPABASE_URL;
assert.equal(storageEnabled(), false, "no SUPABASE_URL means fall back to Postgres");

/* ------------------------------------------------ sealed credentials */
process.env.SESSION_SECRET = "a-long-enough-test-secret-value-0123456789";
const sealed = seal("hunter2");
assert.ok(isSealed(sealed), "sealed values are tagged with their version");
assert.ok(!sealed.includes("hunter2"), "the plaintext never appears in the stored value");
assert.equal(unseal(sealed), "hunter2", "a sealed value round-trips");
assert.notEqual(seal("hunter2"), seal("hunter2"), "a fresh IV each time, so equal secrets differ at rest");
assert.equal(unseal(sealed.slice(0, -2) + "xy"), null, "a tampered ciphertext is rejected, not returned garbled");
assert.equal(unseal("nonsense"), null, "malformed input returns null");
process.env.SESSION_SECRET = "a-different-secret-entirely-9876543210";
assert.equal(unseal(sealed), null, "rotating the secret invalidates stored mailbox passwords");
process.env.SESSION_SECRET = "a-long-enough-test-secret-value-0123456789";

/* --------------------------------------------------- spreadsheet import */
const FIELDS = [
  { key: "full_name", label: "Name", aliases: ["name", "contact"] },
  { key: "email", label: "Email", aliases: ["e-mail", "mail"] },
  { key: "phone", label: "Phone", aliases: ["telephone", "mobile"] },
];
const mapped = autoMap(["Contact Name", "E-Mail Address", "Mobile"], FIELDS);
assert.equal(mapped.full_name, 0, "a header is matched through its alias");
assert.equal(mapped.email, 1, "punctuation and case are ignored when matching");
assert.equal(mapped.phone, 2, "each header is claimed by at most one field");

assert.equal(sheetMoney("₦1,200.50"), 1200.5, "currency symbols and separators are stripped");
assert.equal(sheetMoney("(300)"), -300, "accounting parentheses mean negative");
assert.equal(sheetMoney("not a number"), 0, "unparseable money is zero, not NaN");
assert.equal(sheetDate("2026-03-04"), "2026-03-04", "ISO dates pass through");
assert.equal(sheetDate("04/03/2026"), "2026-03-04", "ambiguous dates are read day-first");
assert.equal(sheetDate("13/03/2026"), "2026-03-13", "a day over 12 disambiguates the order");
assert.equal(sheetEmail("  BOLA@Example.COM "), "bola@example.com", "emails are trimmed and lowercased");
assert.equal(sheetEmail("not-an-email"), null, "invalid emails become null rather than junk rows");
assert.equal(oneOf("Customer", ["lead", "prospect", "customer"], "lead"), "customer", "free text maps onto an allowed value");
assert.equal(oneOf("nonsense", ["lead", "prospect"], "lead"), "lead", "an unknown value falls back");

/* --------------------------------------------------------- lead scoring */
const hot = scoreLead({ email: "a@b.com", phone: "080", company_name: "GTB", job_title: "Managing Director", source: "referral", estimated_value: 60_000_000 });
const cold = scoreLead({ source: "cold_call" });
assert.ok(hot > cold, "a reachable senior referral outranks a bare cold call");
assert.ok(hot <= 100 && cold >= 0, "scores stay inside 0..100");
assert.equal(scoreBand(hot), "hot", "high scores band as hot");
assert.equal(scoreBand(cold), "cold", "low scores band as cold");
assert.equal(scoreLead({}), 0, "an empty lead scores zero rather than throwing");

console.log("✓ all checks passed");
