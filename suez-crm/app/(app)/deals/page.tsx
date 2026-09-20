import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { STAGE_META, crmOptions } from "@/lib/crm";
import { moveDeal } from "@/lib/actions/crm";
import { compactMoney, fmtDate, money } from "@/lib/format";
import { Avatar, BtnLink, Empty, PageHeader } from "@/components/ui";
import { Dialog } from "@/components/form";
import { DealForm } from "@/components/crm-forms";
import { StageSelect } from "@/components/stage-select";
import { Icon } from "@/components/icons";

export const metadata = { title: "Pipeline" };


export default async function DealsBoard() {
  await requireUser();

  const [deals, options] = await Promise.all([
    sql<{ id: number; title: string; value: string; stage: string; probability: number; expected_close: string | null; company: string | null; owner: string | null }>`
      select d.id, d.title, d.value, d.stage, d.probability, d.expected_close,
             c.name as company, u.full_name as owner
        from crm_deals d
        left join crm_companies c on c.id = d.company_id
        left join users u on u.id = d.owner_id
       order by d.value desc`,
    crmOptions(),
  ]);

  const byStage = (s: string) => deals.filter((d) => d.stage === s);
  const weighted = deals
    .filter((d) => !["won", "lost"].includes(d.stage))
    .reduce((sum, d) => sum + (Number(d.value) * d.probability) / 100, 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={`${deals.filter((d) => !["won", "lost"].includes(d.stage)).length} open opportunities · weighted forecast ${money(weighted)}`}
      >
        <BtnLink href="/api/export/crm-deals" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <Dialog label={<><Icon name="plus" /> New opportunity</>} title="Add opportunity" width="max-w-xl">
          <DealForm {...options} />
        </Dialog>
      </PageHeader>

      {deals.length === 0 ? (
        <div className="card">
          <Empty title="No opportunities yet" hint="Add your first opportunity to start tracking the pipeline." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {options.stages.map(({ key: stage, label, color }) => {
            const list = byStage(stage);
            const total = list.reduce((s, d) => s + Number(d.value), 0);
            return (
              <section key={stage} className="flex min-w-0 flex-col">
                <header className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-surface p-3 ring-1 ring-line ring-inset">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-xs font-bold">{label}</span>
                  </span>
                  <span className="text-[11px] font-bold text-ink-soft tabular">
                    {list.length} · {compactMoney(total)}
                  </span>
                </header>

                <ul className="space-y-3">
                  {list.map((d) => (
                    <li key={d.id} className="card p-3.5">
                      <Link href={`/deals/${d.id}`} className="block">
                        <p className="text-sm leading-snug font-bold hover:text-brand-700">{d.title}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-ink-soft">{d.company ?? "No company"}</p>
                        <p className="mt-2.5 text-base font-bold tabular">{compactMoney(d.value)}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-ink-soft">
                          <span className="flex items-center gap-1.5">
                            <Avatar name={d.owner ?? "?"} size="sm" className="h-5 w-5 text-[9px]" />
                            {d.probability}%
                          </span>
                          <span>{fmtDate(d.expected_close)}</span>
                        </div>
                      </Link>
                      <div className="mt-3 border-t border-line pt-2.5">
                        <StageSelect action={moveDeal} id={d.id} stage={d.stage} stages={options.stages} />
                      </div>
                    </li>
                  ))}
                  {list.length === 0 && (
                    <li className="rounded-xl border border-dashed border-line py-6 text-center text-[11px] font-semibold text-ink-soft">
                      Empty
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
