import { sql } from "./db";

export type SavedKpi = {
  id: number;
  name: string;
  entity: "leads" | "deals" | "tickets" | "activities";
  metric: "count" | "sum_value" | "weighted_value" | "average_value";
  filter_field: string | null;
  filter_value: string | null;
  owner_id: number | null;
};

export async function evaluateKpi(kpi: SavedKpi): Promise<number> {
  const field = kpi.filter_field;
  const value = kpi.filter_value || "";
  if (kpi.entity === "deals") {
    const [row] = await sql<{ result: string }>`
      select case ${kpi.metric}
               when 'sum_value' then coalesce(sum(value),0)
               when 'weighted_value' then coalesce(sum(value * probability / 100.0),0)
               when 'average_value' then coalesce(avg(value),0)
               else count(*)::numeric end as result
        from crm_deals
       where (${field || ""} <> 'stage' or stage = ${value})
         and (${field || ""} <> 'owner' or owner_id::text = ${value})
         and (${kpi.owner_id}::int is null or owner_id = ${kpi.owner_id})`;
    return Number(row?.result || 0);
  }
  if (kpi.entity === "leads") {
    const [row] = await sql<{ result: string }>`
      select case ${kpi.metric}
               when 'sum_value' then coalesce(sum(estimated_value),0)
               when 'average_value' then coalesce(avg(estimated_value),0)
               else count(*)::numeric end as result
        from crm_leads
       where (${field || ""} <> 'status' or status = ${value})
         and (${field || ""} <> 'source' or source = ${value})
         and (${field || ""} <> 'owner' or owner_id::text = ${value})
         and (${kpi.owner_id}::int is null or owner_id = ${kpi.owner_id})`;
    return Number(row?.result || 0);
  }
  if (kpi.entity === "tickets") {
    const [row] = await sql<{ result: string }>`
      select count(*)::numeric as result from crm_tickets
       where (${field || ""} <> 'status' or status = ${value})
         and (${field || ""} <> 'priority' or priority = ${value})
         and (${field || ""} <> 'owner' or assignee_id::text = ${value})
         and (${kpi.owner_id}::int is null or assignee_id = ${kpi.owner_id})`;
    return Number(row?.result || 0);
  }
  const [row] = await sql<{ result: string }>`
    select count(*)::numeric as result from crm_activities
     where (${field || ""} <> 'kind' or kind = ${value})
       and (${field || ""} <> 'status' or (${value} = 'completed') = (completed_at is not null))
       and (${field || ""} <> 'owner' or owner_id::text = ${value})
       and (${kpi.owner_id}::int is null or owner_id = ${kpi.owner_id})`;
  return Number(row?.result || 0);
}
