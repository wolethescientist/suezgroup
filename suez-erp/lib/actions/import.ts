"use server";

import { revalidatePath } from "next/cache";
import { sql } from "../db";
import { requireCap } from "../auth";
import { audit } from "../audit";
import { autoMap, readSheet } from "../spreadsheet";
import { findDataset } from "../import-defs";
import { runImport } from "../importer";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Step one: read the upload, show the caller what columns were found and how
 * they were matched. Nothing is written to the business tables here — the user
 * confirms or corrects the mapping first.
 */
export async function inspectUpload(fd: FormData) {
  await requireCap("data.import");
  const file = fd.get("file");
  const datasetKey = str(fd, "dataset");
  const ds = findDataset(datasetKey);
  if (!ds) return { error: "Pick what the file contains." };
  if (!(file instanceof File) || !file.size) return { error: "Choose a .xlsx or .csv file." };
  if (file.size > MAX_BYTES) return { error: "That file is larger than 10 MB." };

  try {
    const sheet = await readSheet(Buffer.from(await file.arrayBuffer()), file.name);
    const map = autoMap(sheet.headers, ds.fields);
    return {
      ok: true as const,
      preview: {
        filename: file.name,
        headers: sheet.headers,
        rows: sheet.rows.slice(0, 5),
        total: sheet.rows.length,
        map,
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Step two: re-read the file with the confirmed mapping and write it.
 *
 * The file is uploaded a second time rather than cached server-side between the
 * two steps — a preview that outlives the request would need a store and an
 * expiry, and re-parsing 5000 rows is cheaper than either.
 */
export async function commitImport(fd: FormData) {
  const me = await requireCap("data.import");
  const file = fd.get("file");
  const datasetKey = str(fd, "dataset");
  const ds = findDataset(datasetKey);
  if (!ds) return { error: "Unknown dataset." };
  if (!(file instanceof File) || !file.size) return { error: "Choose the file again to run the import." };
  if (file.size > MAX_BYTES) return { error: "That file is larger than 10 MB." };

  let map: Record<string, number>;
  try {
    map = JSON.parse(str(fd, "map") || "{}");
  } catch {
    return { error: "The column mapping was not readable. Start the import again." };
  }

  const missing = ds.fields.filter((f) => f.required && map[f.key] === undefined).map((f) => f.label);
  if (missing.length) return { error: `Map a column onto: ${missing.join(", ")}.` };

  const [job] = await sql<{ id: number }>`
    insert into import_jobs (dataset, filename, mapping, user_id)
    values (${datasetKey}, ${file.name}, ${JSON.stringify(map)}::jsonb, ${me.id}) returning id`;

  try {
    const sheet = await readSheet(Buffer.from(await file.arrayBuffer()), file.name);
    const result = await runImport(datasetKey, sheet, {
      map,
      userId: me.id,
      defaultPassword: str(fd, "default_password") || undefined,
    });

    await sql`
      update import_jobs set total_rows = ${sheet.rows.length}, imported = ${result.imported},
                             skipped = ${result.skipped}, errors = ${JSON.stringify(result.errors)}::jsonb,
                             status = 'done'
       where id = ${job.id}`;
    await audit(me.id, "import.run", "import", job.id, { dataset: datasetKey, ...result });

    revalidatePath("/");
    return {
      ok: true as const,
      message:
        `Imported ${result.imported} row(s)` +
        (result.skipped ? `, skipped ${result.skipped}. First problems: ` +
          result.errors.slice(0, 3).map((e) => `row ${e.row} — ${e.reason}`).join("; ") : "."),
    };
  } catch (e) {
    const error = (e as Error).message;
    await sql`update import_jobs set status = 'failed', errors = ${JSON.stringify([{ row: 0, reason: error }])}::jsonb where id = ${job.id}`;
    return { error };
  }
}
