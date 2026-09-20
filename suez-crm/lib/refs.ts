import { sql } from "./db";

/**
 * Human-readable document references: PREFIX/YYYY/0042.
 *
 * ponytail: every document used to draw from one shared `finance_ref_seq`, so
 * the first support ticket raised came out as TKT/2026/0003 because two quotes
 * had already taken 0001 and 0002. Each series gets its own counter; order
 * documents by created_at, not by reference.
 */
const SEQUENCES: Record<string, string> = {
  QTE: "qte_ref_seq",
  TKT: "tkt_ref_seq",
};

export async function nextRef(prefix: string, sequence?: string) {
  const seq = sequence ?? SEQUENCES[prefix] ?? "crm_ref_seq";
  const [row] = await sql<{ n: string }>`select nextval(${seq})::text as n`;
  return `${prefix}/${new Date().getFullYear()}/${String(row.n).padStart(4, "0")}`;
}
