import { can, requireCap } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getStages } from "@/lib/crm";
import { compactMoney, money, titleCase } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Field, Row } from "@/components/ui";
import { ActionForm, ConfirmBtn, Dialog, Select, SubmitBtn } from "@/components/form";
import { deleteKpi, saveKpi } from "@/lib/actions/reports";
import { evaluateKpi, type SavedKpi } from "@/lib/kpis";

export const metadata = { title: "Reports" };


export default async function ReportsPage() {
  const stages = await getStages();
  const me = await requireCap("report.view");

  /**
   * The totals are the team's, because the pipeline board is the team's.
   *
   * ponytail: an earlier pass scoped every figure on this page to the signed-in
   * rep. That was the wrong cut — /deals shows everyone the whole board, so
   * hiding the totals only hid arithmetic they could do by hand. What actually
   * needed gating is the table that ranks colleagues against each other.
   */
  const compareOwners = can(me, "report.view_owners");
  const manageKpis = can(me, "report.manage");

  const [headline, byStage, byOwner, byIndustry, monthly, ageing] = await Promise.all([
    sql<{ open_value: string; won_value: string; lost_value: string; won_n: number; lost_n: number; avg_deal: string }>`
      select coalesce(sum(value) filter (where stage not in ('won','lost')), 0) as open_value,
             coalesce(sum(value) filter (where stage = 'won'), 0) as won_value,
             coalesce(sum(value) filter (where stage = 'lost'), 0) as lost_value,
             count(*) filter (where stage = 'won')::int as won_n,
             count(*) filter (where stage = 'lost')::int as lost_n,
             coalesce(avg(value) filter (where stage = 'won'), 0) as avg_deal
        from crm_deals`,

    sql<{ stage: string; n: number; value: string; weighted: string }>`
      select stage, count(*)::int as n, coalesce(sum(value), 0) as value,
             coalesce(sum(value * probability / 100.0), 0) as weighted
        from crm_deals group by stage`,

    sql<{ owner: string; avatar: string | null; open_n: number; open_value: string; won_n: number; won_value: string }>`
      select u.full_name as owner, u.avatar_url as avatar,
             count(*) filter (where d.stage not in ('won','lost'))::int as open_n,
             coalesce(sum(d.value) filter (where d.stage not in ('won','lost')), 0) as open_value,
             count(*) filter (where d.stage = 'won')::int as won_n,
             coalesce(sum(d.value) filter (where d.stage = 'won'), 0) as won_value
        from crm_deals d join users u on u.id = d.owner_id
       where ${compareOwners}
       group by u.full_name, u.avatar_url
       order by won_value desc, open_value desc`,

    sql<{ industry: string | null; n: number; value: string; won: string }>`
      -- Open deals only. This used to join every deal regardless of stage, so a
      -- column headed PIPELINE was reporting won and lost money alongside it.
      select coalesce(c.industry, 'Unclassified') as industry, count(distinct c.id)::int as n,
             coalesce(sum(d.value) filter (where d.stage not in ('won','lost')), 0) as value,
             coalesce(sum(d.value) filter (where d.stage = 'won'), 0) as won
        from crm_companies c left join crm_deals d on d.company_id = c.id
       group by c.industry order by value desc, won desc limit 10`,

    // Twelve months of closed-won, zero-filled so a quiet month still shows.
    sql<{ month: string; won: string; n: number }>`
      select to_char(m.month, 'Mon YYYY') as month,
             coalesce(sum(d.value), 0) as won,
             count(d.id)::int as n
        from generate_series(date_trunc('month', current_date) - interval '11 months',
                             date_trunc('month', current_date), interval '1 month') as m(month)
        left join crm_deals d on d.stage = 'won' and date_trunc('month', d.updated_at) = m.month
       group by m.month order by m.month`,

    sql<{ bucket: string; n: number; value: string }>`
      select case when now() - created_at < interval '30 days' then 'Under 30 days'
                  when now() - created_at < interval '60 days' then '30–60 days'
                  when now() - created_at < interval '90 days' then '60–90 days'
                  else 'Over 90 days' end as bucket,
             count(*)::int as n, coalesce(sum(value), 0) as value
        from crm_deals where stage not in ('won','lost')
       group by bucket`,
  ]);

  const h = headline[0];
  const winRate = h.won_n + h.lost_n > 0 ? Math.round((h.won_n / (h.won_n + h.lost_n)) * 100) : 0;
  const weighted = byStage.filter((s) => !["won", "lost"].includes(s.stage)).reduce((a, s) => a + Number(s.weighted), 0);
  const peakMonth = Math.max(1, ...monthly.map((m) => Number(m.won)));
  const AGE_ORDER = ["Under 30 days", "30–60 days", "60–90 days", "Over 90 days"];
  const [savedKpis, users] = await Promise.all([
    sql<SavedKpi>`select id,name,entity,metric,filter_field,filter_value,owner_id from crm_saved_kpis order by created_at`,
    sql<{id:number;full_name:string}>`select id,full_name from users where status='active' order by full_name`,
  ]);
  const evaluatedKpis = await Promise.all(savedKpis.map(async kpi => ({...kpi,value:await evaluateKpi(kpi)})));

  return (
    <>
      <PageHeader title="Reports" subtitle="Where the pipeline stands, who is carrying it, and what is going stale.">
        {manageKpis && <Dialog label="Add KPI" title="Add a live KPI">
          <ActionForm action={saveKpi} className="space-y-4">
            <Field label="Name"><input name="name" required className="field" placeholder="Open enterprise pipeline"/></Field>
            <Row><Field label="Dataset"><Select name="entity" className="field">{["deals","leads","tickets","activities"].map(x=><option key={x}>{titleCase(x)}</option>)}</Select></Field><Field label="Metric"><Select name="metric" className="field">{["count","sum_value","weighted_value","average_value"].map(x=><option key={x} value={x}>{titleCase(x)}</option>)}</Select></Field></Row>
            <Row><Field label="Filter field (optional)"><Select name="filter_field" className="field"><option value="">No filter</option>{["stage","status","source","priority","kind","owner"].map(x=><option key={x}>{x}</option>)}</Select></Field><Field label="Filter value"><input name="filter_value" className="field" placeholder="qualification, open, website…"/></Field></Row>
            <Field label="Owner shortcut"><Select name="owner_id" className="field"><option value="">All owners</option>{users.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field>
            <SubmitBtn className="w-full">Add KPI</SubmitBtn>
          </ActionForm>
        </Dialog>}
      </PageHeader>

      {evaluatedKpis.length>0 && <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{evaluatedKpis.map(k=><div key={k.id} className="relative"><Stat label={k.name} value={k.metric==="count"?Math.round(k.value):money(k.value)} hint={`${titleCase(k.entity)}${k.filter_field?` · ${k.filter_field}: ${k.filter_value}`:""}`}/>{manageKpis&&<ActionForm action={deleteKpi} className="absolute top-2 right-2"><input type="hidden" name="id" value={k.id}/><ConfirmBtn title="Remove KPI?" body="Only this saved card is removed." className="px-2 py-1">×</ConfirmBtn></ActionForm>}</div>)}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open pipeline" value={money(h.open_value)} hint={`${money(weighted)} weighted by probability`} />
        <Stat label="Closed won" value={money(h.won_value)} tone="emerald" hint={`${h.won_n} deal${h.won_n === 1 ? "" : "s"}`} />
        <Stat label="Win rate" value={`${winRate}%`} tone={winRate >= 50 ? "emerald" : "amber"} hint={`${h.won_n} won · ${h.lost_n} lost`} />
        <Stat label="Average won deal" value={money(h.avg_deal)} tone="sky" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Pipeline by stage</CardTitle>
          <ul className="space-y-3">
            {stages.map(({ key: stage, label }) => {
              const row = byStage.find((s) => s.stage === stage);
              const value = Number(row?.value ?? 0);
              const max = Math.max(1, ...byStage.map((s) => Number(s.value)));
              return (
                <li key={stage}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-bold">{label}</span>
                    <span className="font-semibold text-ink-soft">
                      {row?.n ?? 0} · <span className="tabular">{compactMoney(value)}</span>
                    </span>
                  </div>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-canvas">
                    <span
                      className={`block h-full ${stage === "won" ? "bg-emerald-500" : stage === "lost" ? "bg-rose-400" : "bg-brand-500"}`}
                      style={{ width: `${(value / max) * 100}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardTitle>Closed won, last 12 months</CardTitle>
            <div className="flex h-44 items-end gap-1.5">
              {monthly.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month}: ${money(m.won)} across ${m.n}`}>
                  <span className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max(2, (Number(m.won) / peakMonth) * 100)}%` }} />
                  <span className="text-[9px] font-bold text-ink-soft">{m.month.slice(0, 3)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs font-medium text-ink-soft">
              Peak month {compactMoney(peakMonth)}. Bars are scaled to that.
            </p>
          </Card>
        </div>

      {/* A leaderboard of colleagues is exactly what report.view_all gates. */}
      {compareOwners && (
          <Card className="mt-5">
            <CardTitle>Performance by owner</CardTitle>
            {byOwner.length === 0 ? (
              <Empty title="No opportunities owned yet" />
            ) : (
              <Table head={["Owner", "Open deals", "Open value", "Won deals", "Won value"]}>
                {byOwner.map((o) => (
                  <tr key={o.owner} className="hover:bg-canvas">
                    <Td><span className="flex items-center gap-2"><Avatar name={o.owner} src={o.avatar} size="sm" />{o.owner}</span></Td>
                    <Td className="tabular">{o.open_n}</Td>
                    <Td className="tabular">{money(o.open_value)}</Td>
                    <Td className="tabular">{o.won_n}</Td>
                    <Td className="tabular font-bold text-emerald-700">{money(o.won_value)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Pipeline ageing</CardTitle>
          <p className="mb-3 text-xs font-medium text-ink-soft">Open opportunities by how long they have been on the board.</p>
          <Table head={["Age", "Deals", "Value"]}>
            {AGE_ORDER.map((bucket) => {
              const row = ageing.find((a) => a.bucket === bucket);
              return (
                <tr key={bucket} className={bucket === "Over 90 days" && Number(row?.n ?? 0) > 0 ? "bg-rose-50/50" : ""}>
                  <Td className="font-bold">
                    {bucket}
                    {bucket === "Over 90 days" && Number(row?.n ?? 0) > 0 && <Badge value="overdue" label="Stale" className="ml-2" />}
                  </Td>
                  <Td className="tabular">{row?.n ?? 0}</Td>
                  <Td className="tabular">{money(row?.value ?? 0)}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card>
          <CardTitle>Top industries</CardTitle>
          {byIndustry.length === 0 ? (
            <Empty title="No companies yet" />
          ) : (
            <Table head={["Industry", "Accounts", "Open pipeline", "Won"]}>
              {byIndustry.map((i) => (
                <tr key={i.industry ?? "none"} className="hover:bg-canvas">
                  <Td className="font-bold">{i.industry}</Td>
                  <Td className="tabular">{i.n}</Td>
                  <Td className="tabular">{money(i.value)}</Td>
                  <Td className="tabular text-emerald-700">{Number(i.won) > 0 ? money(i.won) : "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
