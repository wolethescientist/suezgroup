import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { DATASETS } from "@/lib/import-defs";
import { timeAgo } from "@/lib/format";
import { Badge, Card, CardTitle, PageHeader, Table, Td } from "@/components/ui";
import { SpreadsheetImporter } from "@/components/importer";
import { commitImport, inspectUpload } from "@/lib/actions/import";

export const metadata = { title: "Import from Excel" };

export default async function CrmImportPage() {
  await requireCap("data.import");

  const jobs = await sql<{
    id: number; dataset: string; filename: string; total_rows: number; imported: number;
    skipped: number; errors: { row: number; reason: string }[]; status: string; created_at: string; who: string | null;
  }>`
    select j.*, u.full_name as who from import_jobs j left join users u on u.id = j.user_id
     where j.dataset like 'crm-%' order by j.created_at desc limit 20`;

  return (
    <>
      <PageHeader title="Import from Excel" subtitle="Bring companies, contacts, opportunities and leads in from a spreadsheet." />

      <Card className="mb-5">
        <CardTitle>Import a spreadsheet</CardTitle>
        <p className="mb-4 text-sm font-medium text-ink-soft">
          Column headings are matched to fields automatically — "Coy Name", "Client" and "Organisation" all find the
          company column. Check the mapping on the next step before anything is written.
        </p>
        <SpreadsheetImporter datasets={DATASETS} inspect={inspectUpload} commit={commitImport} />
      </Card>

      {jobs.length > 0 && (
        <Card>
          <CardTitle>Recent imports</CardTitle>
          <Table head={["File", "Into", "Rows", "Imported", "Skipped", "By", "When", "Status"]}>
            {jobs.map((j) => (
              <tr key={j.id} className="hover:bg-canvas">
                <Td className="max-w-48 truncate font-bold">{j.filename}</Td>
                <Td>{j.dataset.replace("crm-", "")}</Td>
                <Td className="tabular">{j.total_rows}</Td>
                <Td className="tabular font-bold text-emerald-700">{j.imported}</Td>
                <Td className={`tabular ${j.skipped ? "font-bold text-rose-700" : ""}`} >
                  {j.skipped}
                  {j.skipped > 0 && Array.isArray(j.errors) && j.errors[0] && (
                    <span className="block text-[11px] font-medium text-ink-soft">row {j.errors[0].row}: {j.errors[0].reason}</span>
                  )}
                </Td>
                <Td>{j.who ?? "—"}</Td>
                <Td className="text-xs">{timeAgo(j.created_at)}</Td>
                <Td><Badge value={j.status === "done" ? "completed" : j.status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
