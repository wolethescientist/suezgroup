"use server";

import { revalidatePath } from "next/cache";
import { requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";

const str = (fd: FormData, key: string) => (fd.get(key) ?? "").toString().trim();

export async function saveKpi(fd: FormData) {
  const me = await requireCap("report.manage");
  const entity = str(fd, "entity");
  const metric = str(fd, "metric");
  if (!["leads", "deals", "tickets", "activities"].includes(entity)) return { error: "Choose a valid CRM dataset." };
  if (!["count", "sum_value", "weighted_value", "average_value"].includes(metric)) return { error: "Choose a valid metric." };
  if (entity !== "deals" && metric === "weighted_value") return { error: "Weighted value applies to opportunities only." };
  if (["tickets", "activities"].includes(entity) && metric !== "count") return { error: "Tickets and activities currently support count KPIs." };
  const [kpi] = await sql<{ id: number }>`
    insert into crm_saved_kpis (name, entity, metric, filter_field, filter_value, owner_id, created_by)
    values (${str(fd, "name") || "CRM KPI"}, ${entity}, ${metric}, ${str(fd, "filter_field") || null},
            ${str(fd, "filter_value") || null}, ${Number(str(fd, "owner_id")) || null}, ${me.id}) returning id`;
  await audit(me.id, "report.kpi.create", "saved_kpi", kpi.id, { entity, metric });
  revalidatePath("/reports");
  return { ok: true, message: "KPI added to Reports." };
}

export async function deleteKpi(fd: FormData) {
  const me = await requireCap("report.manage");
  const id = Number(str(fd, "id"));
  await sql`delete from crm_saved_kpis where id = ${id}`;
  await audit(me.id, "report.kpi.delete", "saved_kpi", id);
  revalidatePath("/reports");
  return { ok: true };
}
