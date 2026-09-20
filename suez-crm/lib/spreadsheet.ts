import ExcelJS from "exceljs";
import { Readable } from "node:stream";

/**
 * Reads .xlsx/.csv uploads into rows of strings.
 *
 * ponytail: exceljs, not the `xlsx` package on npm — that one is the abandoned
 * 0.18.5 build with an unfixed prototype-pollution advisory, and this parser is
 * pointed straight at files staff upload.
 */
export type Sheet = { headers: string[]; rows: string[][] };

const MAX_ROWS = 5000;

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("text" in o) return String(o.text ?? "");
    if ("result" in o) return String(o.result ?? "");   // formula cell
    if ("richText" in o) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if ("hyperlink" in o) return String(o.hyperlink ?? "");
    return "";
  }
  return String(v).trim();
}

export async function readSheet(buf: Buffer, filename: string): Promise<Sheet> {
  const wb = new ExcelJS.Workbook();
  try {
    if (/\.csv$/i.test(filename)) {
      // exceljs' csv reader wants a stream; the buffer is already in memory.
      //
      // ponytail: this was `const { Readable } = await import("node:stream")`.
      // Under the server bundle that dynamic import does not expose Readable as
      // a named export, so it was undefined and every CSV upload died on
      // "Cannot read properties of undefined (reading 'from')". Static import.
      await wb.csv.read(Readable.from(buf));
    } else {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    }
  } catch (e) {
    // Whatever the parser threw is for the log, not for the person uploading.
    console.error("spreadsheet parse failed", filename, e);
    throw new Error(
      "That file could not be read. Check it is a valid .xlsx or .csv and that it is not password protected.",
    );
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("That file has no sheets in it.");

  const all: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (all.length > MAX_ROWS) return;
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    all.push(values.map(cellText));
  });
  if (!all.length) throw new Error("That sheet is empty.");

  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1).filter((r) => r.some((c) => c !== ""));
  if (rows.length > MAX_ROWS) throw new Error(`That file has more than ${MAX_ROWS} rows. Split it and import in parts.`);
  return { headers, rows };
}

/** A field the importer can fill, and the header names it recognises unaided. */
export type FieldSpec = { key: string; label: string; required?: boolean; aliases: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Best-guess header → field mapping, so the common case needs no manual work.
 * Exact alias match wins; otherwise a header containing the alias does.
 * The user can override every guess before the import runs.
 */
export function autoMap(headers: string[], fields: FieldSpec[]): Record<string, number> {
  const map: Record<string, number> = {};
  const taken = new Set<number>();
  const normHeaders = headers.map(norm);

  for (const pass of ["exact", "contains"] as const) {
    for (const f of fields) {
      if (map[f.key] !== undefined) continue;
      for (const alias of [f.key, ...f.aliases]) {
        const a = norm(alias);
        const i = normHeaders.findIndex(
          (h, idx) => !taken.has(idx) && h !== "" && (pass === "exact" ? h === a : h.includes(a) || a.includes(h)),
        );
        if (i !== -1) {
          map[f.key] = i;
          taken.add(i);
          break;
        }
      }
    }
  }
  return map;
}

export const pick = (row: string[], map: Record<string, number>, key: string) => {
  const i = map[key];
  return i === undefined ? "" : (row[i] ?? "").trim();
};

/** Spreadsheet money like "₦1,200.50" or "(300)" → number. Returns 0 for anything unparseable. */
export function money(v: string): number {
  if (!v) return 0;
  const neg = /^\(.*\)$/.test(v.trim());
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

/** Accepts ISO, d/m/Y and m/d/Y; returns YYYY-MM-DD or null. */
export function date(v: string): string | null {
  if (!v) return null;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    // Day-first unless that is impossible — Nigerian office files are d/m/Y.
    const [day, mon] = Number(a) > 12 ? [a, b] : Number(b) > 12 ? [b, a] : [a, b];
    return `${y}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export const email = (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null);

/** Maps a free-text spreadsheet value onto one of `allowed`, else `fallback`. */
export function oneOf(v: string, allowed: readonly string[], fallback: string) {
  const n = norm(v);
  return allowed.find((a) => norm(a) === n) ?? allowed.find((a) => n && norm(a).includes(n)) ?? fallback;
}
