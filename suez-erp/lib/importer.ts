import { sql } from "./db";
import { hashPassword } from "./password";
import { date, email as parseEmail, money, oneOf, pick, type Sheet } from "./spreadsheet";

export type ImportResult = { imported: number; skipped: number; errors: { row: number; reason: string }[] };

type Ctx = { map: Record<string, number>; userId: number; defaultPassword?: string };

/** Resolves an email in a spreadsheet cell to a user id, so "owner" columns work. */
async function userIdByEmail(v: string): Promise<number | null> {
  const e = parseEmail(v);
  if (!e) return null;
  const [u] = await sql<{ id: number }>`select id from users where lower(email) = ${e}`;
  return u?.id ?? null;
}

async function departmentIdByName(name: string): Promise<number | null> {
  const n = name.trim();
  if (!n) return null;
  const [found] = await sql<{ id: number }>`select id from departments where lower(name) = lower(${n}) limit 1`;
  if (found) return found.id;
  const [made] = await sql<{ id: number }>`insert into departments (name) values (${n}) returning id`;
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
      void ownerId;

      switch (dataset) {




        case "customers": {
          const name = get(row, "name");
          if (!name) throw new Error("No customer name in this row.");
          await sql`
            insert into customers (name, email, phone, address, tax_id)
            values (${name}, ${parseEmail(get(row, "email"))},
                    ${get(row, "phone") || null}, ${get(row, "address") || null},
                    ${get(row, "tax_id") || null})
            on conflict (lower(name)) do update
              set email    = coalesce(excluded.email, customers.email),
                  phone    = coalesce(excluded.phone, customers.phone),
                  address  = coalesce(excluded.address, customers.address)`;
          break;
        }

        case "employees": {
          const mail = parseEmail(get(row, "email"));
          const fullName = get(row, "full_name");
          if (!fullName) throw new Error("No employee name in this row.");
          if (!mail) throw new Error("No valid email address in this row.");
          const deptId = await departmentIdByName(get(row, "department"));
          const managerId = await userIdByEmail(get(row, "manager"));
          const role = oneOf(get(row, "role"), ["admin", "hr", "manager", "staff"], "staff");

          const [existing] = await sql<{ id: number }>`select id from users where lower(email) = ${mail}`;
          if (existing) {
            await sql`
              update users set full_name = ${fullName}, job_title = ${get(row, "job_title") || null},
                               department_id = coalesce(${deptId}, department_id),
                               manager_id = coalesce(${managerId}, manager_id),
                               phone = coalesce(nullif(${get(row, "phone")}, ''), phone),
                               staff_no = coalesce(nullif(${get(row, "staff_no")}, ''), staff_no)
               where id = ${existing.id}`;
          } else {
            if (!ctx.defaultPassword) throw new Error("New employee, but no temporary password was set for this import.");
            await sql`
              insert into users (staff_no, full_name, email, password_hash, role, job_title, department_id, manager_id, phone)
              values (${get(row, "staff_no") || null}, ${fullName}, ${mail}, ${hashPassword(ctx.defaultPassword)},
                      ${role}, ${get(row, "job_title") || null}, ${deptId}, ${managerId}, ${get(row, "phone") || null})`;
          }
          break;
        }

        case "inventory": {
          const sku = get(row, "sku");
          const name = get(row, "name");
          if (!sku || !name) throw new Error("A row needs both an SKU and an item name.");
          await sql`
            insert into inventory_items (sku, name, category, unit, quantity, reorder_level, unit_cost)
            values (${sku}, ${name}, ${get(row, "category") || null}, ${get(row, "unit") || "each"},
                    ${money(get(row, "quantity"))}, ${money(get(row, "reorder_level"))}, ${money(get(row, "unit_cost"))})
            on conflict (sku) do update
              set name = excluded.name, category = coalesce(excluded.category, inventory_items.category),
                  reorder_level = excluded.reorder_level, unit_cost = excluded.unit_cost`;
          break;
        }

        case "assets": {
          const tag = get(row, "tag");
          const name = get(row, "name");
          if (!tag || !name) throw new Error("A row needs both an asset tag and a name.");
          await sql`
            insert into assets (tag, name, category, serial_no, purchase_date, purchase_cost, location, status)
            values (${tag}, ${name},
                    ${oneOf(get(row, "category"), ["it", "furniture", "vehicle", "machinery", "building", "other"], "other")},
                    ${get(row, "serial_no") || null}, ${date(get(row, "purchase_date"))},
                    ${money(get(row, "purchase_cost"))}, ${get(row, "location") || null},
                    ${oneOf(get(row, "status"), ["in_store", "assigned", "maintenance", "retired", "disposed"], "in_store")})
            on conflict (tag) do update
              set name = excluded.name, serial_no = coalesce(excluded.serial_no, assets.serial_no),
                  location = coalesce(excluded.location, assets.location)`;
          break;
        }

        case "vendors": {
          const name = get(row, "name");
          if (!name) throw new Error("No vendor name in this row.");
          const [dupe] = await sql<{ id: number }>`select id from vendors where lower(name) = lower(${name}) limit 1`;
          if (dupe) {
            await sql`
              update vendors set category = coalesce(nullif(${get(row, "category")}, ''), category),
                                 email = coalesce(nullif(${get(row, "email")}, ''), email),
                                 phone = coalesce(nullif(${get(row, "phone")}, ''), phone)
               where id = ${dupe.id}`;
          } else {
            await sql`
              insert into vendors (name, category, email, phone, address, tax_id, bank_details)
              values (${name}, ${get(row, "category") || null}, ${parseEmail(get(row, "email"))},
                      ${get(row, "phone") || null}, ${get(row, "address") || null},
                      ${get(row, "tax_id") || null}, ${get(row, "bank_details") || null})`;
          }
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
