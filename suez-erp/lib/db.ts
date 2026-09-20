import { neon, types as neonTypes } from "@neondatabase/serverless";
import pg from "pg";

/**
 * One `sql` tagged template over two drivers.
 *
 * ponytail: raw SQL, no ORM — the queries in this app are hand-written joins
 * anyway, and an ORM would only hide them.
 *
 * Which driver runs is decided by the connection string, not by an env flag, so
 * there is nothing to remember to flip:
 *
 *   - a Neon host  → the Neon serverless HTTP driver (what production uses)
 *   - anything else → node-postgres against a normal server, which is how the
 *     dockerised Postgres in docker-compose.yml is reached locally
 *
 * Both return a plain array of rows, so no call site knows the difference.
 */
type Sql = <T = Record<string, any>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

let driver: Sql | undefined;

/**
 * Which driver a connection string calls for.
 *
 * Exported so it can be tested directly — "it supports both" is worth proving
 * rather than asserting, and the two paths are hard to exercise side by side.
 */
export function driverKind(url: string): "neon" | "postgres" {
  return /(^|[@.\/])[^@\/]*\.neon\.tech([:\/?]|$)|\bneon\.build\b/.test(url) ? "neon" : "postgres";
}

/** True for a host reached over loopback, which needs no TLS. */
export const isLocalHost = (url: string) => /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:\/]/.test(url);

const isNeon = (url: string) => driverKind(url) === "neon";

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env — run `docker compose up -d` for a local database, " +
        "or paste a Neon connection string to use the hosted one.",
    );
  return url;
}

/**
 * node-postgres takes positional parameters, so the template's interpolations
 * become $1, $2, … in the order they appear. Values are never concatenated into
 * the SQL text, which is what keeps this injection-safe.
 */
/**
 * Make both drivers hand back the same shapes: dates as strings.
 *
 * Left to themselves, node-postgres parses date/timestamp columns into JS Date
 * objects and so, since it grew its own type parsing, does the Neon HTTP
 * driver. The app treats a date column as a `YYYY-MM-DD` string throughout —
 * it compares `work_date` to today, slices `week_start`, and puts `period_start`
 * straight into a URL — so a Date object silently turns every one of those into
 * a comparison against "Wed Sep 17 2026 01:00:00 GMT+0100", which is false
 * without ever being an error.
 *
 * ponytail: node-postgres was pinned to strings here and Neon was assumed to
 * already return them. It did once. test/db.mjs has been failing against Neon
 * ever since it stopped, which is the test doing its job — the fix is to pin
 * both, rather than to pin one and hope.
 *
 * Numerics stay strings on both, deliberately: a NUMERIC(14,2) does not fit in
 * a double, and money is read with Number() at the point of use.
 */
const DATE_OIDS = [1082, 1114, 1184, 1083, 1266]; // date, timestamp, timestamptz, time, timetz
const asString = (v: string) => v;
for (const oid of DATE_OIDS) pg.types.setTypeParser(oid, asString);

/**
 * The same rule for Neon, which bundles its own copy of pg-types.
 *
 * Setting the parser on `pg.types` above cannot reach it, and `neon(url, {
 * types })` does not work either: the driver reads `types` from the *per-query*
 * options, never from the connection options, so a connection-level parser is
 * accepted and silently ignored. Its exported `types` module is the one thing
 * the tagged-template path actually consults.
 */
for (const oid of DATE_OIDS) neonTypes.setTypeParser(oid, asString);

function pgDriver(url: string): Sql {
  const pool = new pg.Pool({
    connectionString: url,
    // A local container needs no TLS; a managed server that is not Neon usually does.
    ssl: isLocalHost(url) ? false : { rejectUnauthorized: false },
    max: 10,
  });
  return async (strings, ...values) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), "");
    const { rows } = await pool.query(text, values as unknown[]);
    return rows as any;
  };
}

export const sql: Sql = (strings, ...values) => {
  if (!driver) {
    const url = connectionString();
    driver = isNeon(url) ? (neon(url) as unknown as Sql) : pgDriver(url);
  }
  return driver(strings, ...values);
};

/** True when running against the local dockerised Postgres rather than Neon. */
export const usingLocalPostgres = () => !isNeon(process.env.DATABASE_URL ?? "");
