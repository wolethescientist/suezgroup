import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { STAGE_META, crmOptions } from "@/lib/crm";
import { compactMoney, fmtDate, money, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, Empty, PageHeader, Stat } from "@/components/ui";
import { Dialog } from "@/components/form";
import { CompanyForm, DealForm } from "@/components/crm-forms";
import { Icon } from "@/components/icons";

export const metadata = { title: "CRM" };

export default async function CrmOverview() {
  const me = await requireUser();

  /**
   * Company-wide, like the pipeline board it summarises. An earlier pass scoped
   * these to the signed-in rep, which hid arithmetic anyone could do off the
   * board — the comparison of colleagues on Reports is the part that is gated.
   */

  const [[totals], stages, topDeals, recentActivity, options] = await Promise.all([
    sql<{ open_value: string; won_value: string; open_count: number; won_count: number; lost_count: number; companies: number; contacts: number }>`
      select
        coalesce(sum(value) filter (where stage not in ('won','lost')), 0) as open_value,
        coalesce(sum(value) filter (where stage = 'won'), 0) as won_value,
        count(*) filter (where stage not in ('won','lost'))::int as open_count,
        count(*) filter (where stage = 'won')::int as won_count,
        count(*) filter (where stage = 'lost')::int as lost_count,
        (select count(*) from crm_companies)::int as companies,
        (select count(*) from crm_contacts)::int as contacts
      from crm_deals`,
    sql<{ stage: string; n: number; total: string }>`
      select stage, count(*)::int as n, coalesce(sum(value),0) as total from crm_deals group by stage`,
    sql<{ id: number; title: string; value: string; stage: string; probability: number; company: string | null; owner: string | null; expected_close: string | null }>`
      select d.id, d.title, d.value, d.stage, d.probability, c.name as company, u.full_name as owner, d.expected_close
        from crm_deals d
        left join crm_companies c on c.id = d.company_id
        left join users u on u.id = d.owner_id
       where d.stage not in ('won','lost')
       order by d.value desc limit 6`,
    sql<{ id: number; kind: string; subject: string; due_at: string | null; completed_at: string | null; deal: string | null; company: string | null; owner: string | null }>`
      select a.id, a.kind, a.subject, a.due_at, a.completed_at, d.title as deal, c.name as company, u.full_name as owner
        from crm_activities a
        left join crm_deals d on d.id = a.deal_id
        left join crm_companies c on c.id = a.company_id
        left join users u on u.id = a.owner_id
       order by coalesce(a.due_at, a.created_at) desc limit 7`,
    crmOptions(),
  ]);

  const stageMap = Object.fromEntries(stages.map((s) => [s.stage, s]));
  const pipelineMax = Math.max(1, ...stages.filter((s) => !["won", "lost"].includes(s.stage)).map((s) => Number(s.total)));
  const closed = totals.won_count + totals.lost_count;
  const winRate = closed ? Math.round((totals.won_count / closed) * 100) : 0;

  return (
    <>
      <PageHeader title="CRM" subtitle="Accounts, opportunities and everything the sales team owes a client.">
        <Dialog label="New company" variant="outline" title="Add company">
          <CompanyForm owners={options.owners} />
        </Dialog>
        <Dialog label={<><Icon name="plus" /> New opportunity</>} title="Add opportunity" width="max-w-xl">
          <DealForm {...options} />
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open pipeline" value={money(totals.open_value)} hint={`${totals.open_count} live opportunities`} tone="brand" />
        <Stat label="Closed won" value={money(totals.won_value)} hint={`${totals.won_count} deals`} tone="emerald" />
        <Stat label="Win rate" value={`${winRate}%`} hint={`${totals.won_count} won · ${totals.lost_count} lost`} tone="sky" />
        <Stat label="Accounts" value={totals.companies} hint={`${totals.contacts} contacts on file`} tone="amber" />
      </div>

      {/* items-start: grid children stretch to the tallest by default, which left
          the shorter column as a card with a hand-span of empty white below its
          content. Each card should be as tall as what is in it. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle action={<Link href="/deals" className="text-xs font-bold text-brand-700 hover:underline">Open board</Link>}>
            Pipeline by stage
          </CardTitle>
          <ul className="space-y-4">
            {["qualification", "proposal", "negotiation"].map((s) => {
              const row = stageMap[s];
              const total = Number(row?.total ?? 0);
              return (
                <li key={s}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-bold">{STAGE_META[s].label}</span>
                    <span className="font-semibold text-ink-soft tabular">
                      {row?.n ?? 0} deal{(row?.n ?? 0) === 1 ? "" : "s"} · {compactMoney(total)}
                    </span>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${Math.max(2, (total / pipelineMax) * 100)}%`, background: STAGE_META[s].color }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
            {["won", "lost"].map((s) => (
              <div key={s} className="rounded-xl bg-canvas p-3.5">
                <p className="eyebrow flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STAGE_META[s].color }} aria-hidden />
                  {STAGE_META[s].label}
                </p>
                <p className="mt-1.5 text-xl leading-none font-bold tracking-[-0.02em] tabular">
                  {compactMoney(stageMap[s]?.total ?? 0)}
                </p>
                <p className="mt-1.5 text-xs font-semibold text-ink-soft">
                  {stageMap[s]?.n ?? 0} {(stageMap[s]?.n ?? 0) === 1 ? "opportunity" : "opportunities"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle action={<Link href="/activities" className="text-xs font-bold text-brand-700 hover:underline">All</Link>}>
            Recent activity
          </CardTitle>
          {recentActivity.length === 0 ? (
            <Empty title="No activity logged" />
          ) : (
            <ul className="space-y-3.5">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                      a.completed_at ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"
                    }`}
                  >
                    <Icon name={a.kind === "call" ? "chat" : a.kind === "email" ? "mail" : a.kind === "meeting" ? "users" : "check"} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{a.subject}</span>
                    <span className="block truncate text-xs font-medium text-ink-soft">
                      {a.deal ?? a.company ?? titleCase(a.kind)} · {a.owner ?? "Unassigned"} ·{" "}
                      {a.completed_at ? `done ${timeAgo(a.completed_at)}` : a.due_at ? timeAgo(a.due_at) : "no date"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <CardTitle action={<Link href="/deals" className="text-xs font-bold text-brand-700 hover:underline">View pipeline</Link>}>
          Largest open opportunities
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {topDeals.map((d) => (
            <Link key={d.id} href={`/deals/${d.id}`} className="card block p-4 card-hover">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm leading-snug font-bold">{d.title}</h3>
                <Badge value={d.stage} />
              </div>
              <p className="mt-1 text-xs font-semibold text-ink-soft">{d.company ?? "No company"}</p>
              <p className="mt-3 text-lg font-bold tabular">{money(d.value)}</p>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className="flex items-center gap-2">
                  <Avatar name={d.owner ?? "?"} size="sm" />
                  <span className="text-xs font-semibold text-ink-soft">{d.owner ?? "Unassigned"}</span>
                </span>
                <span className="text-xs font-bold text-ink-soft">{d.probability}% · {fmtDate(d.expected_close)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
