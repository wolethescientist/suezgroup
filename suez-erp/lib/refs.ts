import { sql } from "./db";

/**
 * Human-readable document references: PREFIX/YYYY/0042.
 *
 * ponytail: every finance and operations document used to draw from one shared
 * `finance_ref_seq`, so the company's first sales invoice came out as
 * INV/2026/0015 and each series was full of holes wherever an expense or a
 * purchase order had taken the next number. An invoice series has to be its own
 * contiguous run — that is what an auditor, and FIRS, expect to see. Each
 * prefix now has its own sequence; order documents by created_at, not by ref.
 */
const SEQUENCES: Record<string, string> = {
  INV: "inv_ref_seq",
  PINV: "pinv_ref_seq",
  EXP: "exp_ref_seq",
  PR: "pr_ref_seq",
  PO: "po_ref_seq",
};

export async function nextRef(prefix: string, sequence?: string) {
  const seq = sequence ?? SEQUENCES[prefix] ?? "finance_ref_seq";
  const [row] = await sql<{ n: string }>`select nextval(${seq})::text as n`;
  return `${prefix}/${new Date().getFullYear()}/${String(row.n).padStart(4, "0")}`;
}
