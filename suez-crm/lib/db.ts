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
 * Make node-postgres hand back the same shapes the Neon driver does.
 *
 * node-postgres parses date/timestamp columns into JS Date objects; the Neon
 * HTTP driver returns them as strings. Without this, `row.week_start.slice(0, 10)`
 * works in production and throws locally — the two environments would disagree
 * about the type of every date column, which is exactly the kind of difference
 * that only shows up in front of someone. Numerics stay strings on both.
 */
const DATE_OIDS = [1082, 1114, 1184, 1083, 1266]; // date, timestamp, timestamptz, time, timetz
const asString = (v: string) => v;
for (const oid of DATE_OIDS) pg.types.setTypeParser(oid, asString);

/**
 * The same rule for Neon, which bundles its own copy of pg-types.
 *
 * ponytail: node-postgres was pinned to strings here and Neon was assumed to
 * already return them. It does not — it parses dates into Date objects — so
 * every `occurred_on === today` and every `.slice(0, 10)` behaved one way
 * locally and another in production, silently.
 *
 * Setting the parser on `pg.types` cannot reach Neon's copy, and
 * `neon(url, { types })` does not work either: the driver reads `types` from
 * the per-query options and never from the connection options, so a
 * connection-level parser is accepted and quietly ignored. Its exported
 * `types` module is the one the tagged-template path actually consults.
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
