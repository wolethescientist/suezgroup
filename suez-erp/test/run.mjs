// The whole suite. `npm test` runs this.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const file of ["core.mjs", "sanitize.mjs", "unit.mjs", "guards.mjs", "db.mjs"]) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", join(here, file)], {
    stdio: "inherit",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  if (r.status !== 0) failed++;
}
if (failed) { console.error(`\n✗ ${failed} test file(s) failed`); process.exit(1); }
console.log("\n✓ all checks passed");
