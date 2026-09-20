// Every server action must establish who is calling before it touches anything.
//
// This exists because touchMemo and markConversationRead once took a user id as
// a parameter — and a "use server" export accepts whatever the client sends, so
// any employee could stamp a read receipt against a colleague. Types cannot
// catch that; this can.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIRS = ["lib/actions"];

/**
 * Actions that legitimately run without an established session.
 * Keep this list short and justified — every entry is a hole by design.
 *   login  — establishes the session in the first place
 *   logout — clears a cookie; harmless to call with no session
 *   submitLeadForm — public hosted form; validates an active CRM form and uses a honeypot
 */
const PUBLIC = new Set(["login", "logout", "submitLeadForm"]);

const problems = [];
let checked = 0;

for (const dir of DIRS) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const path = join(dir, file);
    const src = readFileSync(path, "utf8");
    assert.ok(src.startsWith('"use server"'), `${path} must be marked "use server"`);

    // Split on each exported action and inspect its body.
    const parts = src.split(/export async function /).slice(1);
    for (const part of parts) {
      const name = part.slice(0, part.indexOf("("));
      const body = part.slice(part.indexOf("{"));
      checked++;
      if (PUBLIC.has(name)) continue;

      if (!/require(User|Role|Cap)\s*\(/.test(body)) {
        problems.push(`${path}: ${name}() never calls requireUser/requireCap`);
        continue;
      }
      // The identity must come from the session, not from what the caller passed.
      const signature = part.slice(part.indexOf("("), part.indexOf(")") + 1);
      if (/\b(userId|user_id|actorId|asUser)\b/.test(signature)) {
        problems.push(`${path}: ${name}${signature} takes a caller-supplied user id — derive it from the session`);
      }
    }
  }
}

assert.equal(problems.length, 0, `\n  ${problems.join("\n  ")}\n`);
assert.ok(checked > 20, `expected to audit the whole action surface, only saw `);
/**
 * The capability catalogue and the code must agree.
 *
 * A capability the Roles screen offers but nothing checks is a promise the
 * system cannot keep; one the code checks but the catalogue does not list can
 * never be granted, so the feature is unreachable however roles are configured.
 */
const capsSrc = readFileSync("lib/capabilities.ts", "utf8");
// Only the CAPABILITIES array — BUILTIN_ROLES below it uses `key` for role keys.
const catalogue = capsSrc.slice(capsSrc.indexOf("export const CAPABILITIES"), capsSrc.indexOf("export const CAPABILITY_KEYS"));
const declared = new Set([...catalogue.matchAll(/key: "([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)"/g)].map((m) => m[1]));

const searched = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && full !== "lib/capabilities.ts") searched.push(full);
  }
};
["lib", "app", "components"].forEach(walk);

const used = new Set();
for (const file of searched) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/(?:requireCap|can|canAny)\(\s*(?:me|u|user)?,?\s*"([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/caps: \[([^\]]*)\]/g))
    for (const q of m[1].matchAll(/"([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)"/g)) used.add(q[1]);
}

const undeclared = [...used].filter((c) => !declared.has(c));
assert.equal(undeclared.length, 0, `capabilities checked in code but missing from the catalogue: ${undeclared.join(", ")}`);

const unchecked = [...declared].filter((c) => !used.has(c));
assert.equal(unchecked.length, 0, `capabilities offered on the Roles screen that nothing checks: ${unchecked.join(", ")}`);

console.log(`✓ guards: ${checked} server actions, every one authenticates`);
console.log(`✓ capabilities: ${declared.size} declared, all checked in code and all checks declared`);
