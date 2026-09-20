// Pure CSV serialisation. Kept dependency-free so tests can import it directly.

/**
 * One field, RFC 4180 quoted.
 *
 * The leading-apostrophe guard is not cosmetic: a value beginning `=`, `+`, `-`, `@`
 * or a control character is executed as a formula when the file is opened in Excel or
 * Sheets, and these exports carry names and notes that employees typed. Quoting alone
 * does not stop it — the cell content itself has to be defused.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const defused = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(defused) ? `"${defused.replace(/"/g, '""')}"` : defused;
}

/** Header row plus one row per record, CRLF terminated, BOM so Excel reads UTF-8. */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const lines = [columns.map((c) => csvField(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c.key])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** `suezerp-leave-requests-2026-07-30.csv` */
export function csvFilename(name: string) {
  return `suezerp-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function csvResponse(name: string, columns: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
