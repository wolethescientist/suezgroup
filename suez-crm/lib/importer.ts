import { sql } from "./db";
import { date, email as parseEmail, money, oneOf, pick, type Sheet } from "./spreadsheet";
import { scoreLead } from "./scoring";

export type ImportResult = { imported: number; skipped: number; errors: { row: number; reason: string }[] };

type Ctx = { map: Record<string, number>; userId: number; defaultPassword?: string };

/** Resolves an email in a spreadsheet cell to a user id, so "owner" columns work. */
async function userIdByEmail(v: string): Promise<number | null> {
  const e = parseEmail(v);
  if (!e) return null;
  const [u] = await sql<{ id: number }>`select id from users where lower(email) = ${e}`;
  return u?.id ?? null;
}

async function companyIdByName(name: string, ownerId: number | null): Promise<number | null> {
  const n = name.trim();
  if (!n) return null;
  const [found] = await sql<{ id: number }>`select id from crm_companies where lower(name) = lower(${n}) limit 1`;
  if (found) return found.id;
  const [made] = await sql<{ id: number }>`
    insert into crm_companies (name, owner_id) values (${n}, ${ownerId}) returning id`;
  return made.id;
}

/**
 * Applies a parsed sheet to the database, one row at a time.
 *
 * Every dataset upserts on a natural key (company name, email, SKU, asset tag)
 * rather than inserting blindly — re-importing a corrected spreadsheet is the
 * normal way people fix a bad import, and it must not double the data.
 *
 * A row that throws is recorded and skipped; one malformed line does not abandon
 * the other four hundred.
 */
export async function runImport(dataset: string, sheet: Sheet, ctx: Ctx): Promise<ImportResult> {
  const res: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const get = (row: string[], k: string) => pick(row, ctx.map, k);

  for (const [i, row] of sheet.rows.entries()) {
    const line = i + 2; // +1 for the header, +1 because humans count from one
    try {
      const ownerId = (await userIdByEmail(get(row, "owner"))) ?? ctx.userId;

      switch (dataset) {
        case "crm-companies": {
          const name = get(row, "name");
          if (!name) throw new Error("No company name in this row.");
          await sql`
            insert into crm_companies (name, industry, website, email, phone, address, size, status, notes, owner_id)
            values (${name}, ${get(row, "industry") || null}, ${get(row, "website") || null},
                    ${parseEmail(get(row, "email"))}, ${get(row, "phone") || null}, ${get(row, "address") || null},
                    ${get(row, "size") || null},
                    ${oneOf(get(row, "status"), ["lead", "prospect", "customer", "churned"], "lead")},
                    ${get(row, "notes") || null}, ${ownerId})
            on conflict do nothing`;
          // No unique index on name, so update an existing row explicitly.
          await sql`
            update crm_companies set industry = coalesce(nullif(${get(row, "industry")}, ''), industry),
                                     phone = coalesce(nullif(${get(row, "phone")}, ''), phone),
                                     website = coalesce(nullif(${get(row, "website")}, ''), website)
             where lower(name) = lower(${name})`;
          break;
        }

        case "crm-contacts": {
          const fullName = get(row, "full_name");
          if (!fullName) throw new Error("No contact name in this row.");
          const companyId = await companyIdByName(get(row, "company"), ownerId);
          const mail = parseEmail(get(row, "email"));
          const [dupe] = mail
            ? await sql<{ id: number }>`select id from crm_contacts where lower(email) = ${mail} limit 1`
            : [];
          if (dupe) {
            await sql`
              update crm_contacts set full_name = ${fullName}, job_title = ${get(row, "job_title") || null},
                                      phone = coalesce(nullif(${get(row, "phone")}, ''), phone),
                                      company_id = coalesce(${companyId}, company_id)
               where id = ${dupe.id}`;
          } else {
            await sql`
              insert into crm_contacts (company_id, full_name, job_title, email, phone, notes, owner_id)
              values (${companyId}, ${fullName}, ${get(row, "job_title") || null}, ${mail},
                      ${get(row, "phone") || null}, ${get(row, "notes") || null}, ${ownerId})`;
          }
          break;
        }

        case "crm-deals": {
          const title = get(row, "title");
          if (!title) throw new Error("No opportunity name in this row.");
          const companyId = await companyIdByName(get(row, "company"), ownerId);
          const stage = oneOf(get(row, "stage"), ["qualification", "proposal", "negotiation", "won", "lost"], "qualification");
          const prob = Number(get(row, "probability").replace(/[^0-9]/g, "")) || null;
          await sql`
            insert into crm_deals (title, company_id, value, currency, stage, probability, expected_close, notes, owner_id)
            values (${title}, ${companyId}, ${money(get(row, "value"))}, ${get(row, "currency") || "NGN"},
                    ${stage}, ${prob ?? (stage === "won" ? 100 : stage === "lost" ? 0 : 20)},
                    ${date(get(row, "expected_close"))}, ${get(row, "notes") || null}, ${ownerId})`;
          break;
        }

        case "crm-leads": {
          const fullName = get(row, "full_name");
          if (!fullName) throw new Error("No lead name in this row.");
          const lead = {
            full_name: fullName,
            company_name: get(row, "company_name") || null,
            job_title: get(row, "job_title") || null,
            email: parseEmail(get(row, "email")),
            phone: get(row, "phone") || null,
            source: oneOf(get(row, "source"), ["website", "referral", "event", "cold_call", "campaign", "linkedin", "other"], "other"),
            industry: get(row, "industry") || null,
            estimated_value: money(get(row, "estimated_value")),
          };
          await sql`
            insert into crm_leads (full_name, company_name, job_title, email, phone, source, industry,
                                   estimated_value, score, notes, owner_id)
            values (${lead.full_name}, ${lead.company_name}, ${lead.job_title}, ${lead.email}, ${lead.phone},
                    ${lead.source}, ${lead.industry}, ${lead.estimated_value}, ${scoreLead(lead)},
                    ${get(row, "notes") || null}, ${ownerId})`;
          break;
        }





        default:
          throw new Error(`Unknown dataset "${dataset}".`);
      }
      res.imported++;
    } catch (e) {
      res.skipped++;
      if (res.errors.length < 50) res.errors.push({ row: line, reason: (e as Error).message });
    }
  }
  return res;
}
