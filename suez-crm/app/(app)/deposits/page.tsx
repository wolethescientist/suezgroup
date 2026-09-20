import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { compactMoney, fmtDate, money } from "@/lib/format";
import { listDeposits, remainingRatio } from "@/lib/deposits";
import { Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Dialog } from "@/components/form";
import { Icon } from "@/components/icons";
import { DepositForm } from "@/components/deposit-forms";

export const metadata = { title: "Deposit accounts" };

/**
 * Money customers have paid in advance, and how much of it is left.
 *
 * ponytail: there was nowhere to put this. A customer who paid ₦500m up front
 * and then drew goods against it for months was tracked in a spreadsheet, and
 * "how much is left on their account" was answered by adding up waybills.
 */
export default async function DepositsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser();
  const { q = "" } = await searchParams;

  const [rows, companies, owners] = await Promise.all([
    listDeposits(me, { q }),
    sql<{ id: number; name: string }>`select id, name from crm_companies order by name`,
    sql<{ id: number; full_name: string }>`select id, full_name from users where status = 'active' order by full_name`,
  ]);

  const active = rows.filter((r) => r.status === "active");
  const held = active.reduce((s, r) => s + Number(r.balance), 0);
  const drawn = rows.reduce((s, r) => s + Number(r.drawn), 0);
  const dry = active.filter((r) => Number(r.balance) <= 0).length;

  return (
    <>
      <PageHeader
        title="Deposit accounts"
        subtitle="Money paid in advance, drawn down as goods are supplied."
      >
        <BtnLink href="/api/export/crm-deposits" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        {can(me, "deposit.manage") && (
          <Dialog label={<><Icon name="plus" /> New deposit account</>} title="Open a deposit account" width="max-w-xl">
            <DepositForm companies={companies} owners={owners} />
          </Dialog>
        )}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Held on account" value={compactMoney(held)} tone="emerald" hint="Across active accounts" />
        <Stat label="Drawn to date" value={compactMoney(drawn)} tone="sky" />
        <Stat label="Active accounts" value={active.length} />
        <Stat label="Exhausted" value={dry} tone={dry ? "rose" : "brand"} hint={dry ? "Need new funding" : "None"} />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <input name="q" defaultValue={q} placeholder="Search customer, account or reference…" className="field pl-9" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </div>
        <button type="submit" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">Search</button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty
            title={q ? "No accounts match that" : "No deposit accounts yet"}
            hint={
              q
                ? "Try a shorter term."
                : "Open one when a customer pays in advance, then record each request against it."
            }
          />
        </Card>
      ) : (
        <Table head={["Reference", "Customer", "Funded", "Drawn", "Remaining", "", "Owner", ""]}>
          {rows.map((d) => {
            const funded = Number(d.funded);
            const balance = Number(d.balance);
            const left = remainingRatio(funded, balance);
            const empty = balance <= 0;
            const low = !empty && left <= Number(d.low_balance_ratio);
            return (
              <tr key={d.id} className="hover:bg-canvas">
                <Td className="font-bold tabular">{d.ref}</Td>
                <Td>
                  <span className="block font-bold">{d.company}</span>
                  <span className="block text-[11px] font-semibold text-ink-soft">{d.name}</span>
                </Td>
                <Td className="tabular">{money(funded, d.currency)}</Td>
                <Td className="tabular text-ink-soft">{money(Number(d.drawn), d.currency)}</Td>
                <Td className={`tabular font-bold ${empty ? "text-rose-700" : low ? "text-amber-700" : "text-emerald-700"}`}>
                  {money(balance, d.currency)}
                </Td>
                <Td className="w-32">
                  {/* The bar is the answer to "how much is left" at a glance. */}
                  <span className="block h-1.5 w-28 overflow-hidden rounded-full bg-line" title={`${Math.round(left * 100)}% remaining`}>
                    <span
                      className={`block h-full rounded-full ${empty ? "bg-rose-500" : low ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.max(left > 0 ? 3 : 0, left * 100)}%` }}
                    />
                  </span>
                  <span className="mt-0.5 block text-[10px] font-bold text-ink-soft">
                    {Math.round(left * 100)}% left
                    {d.last_movement_on ? ` · ${fmtDate(d.last_movement_on)}` : ""}
                  </span>
                </Td>
                <Td className="text-xs">{d.owner ?? <span className="text-ink-soft">—</span>}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    {d.status === "closed" && <Badge value="closed" />}
                    {empty && d.status === "active" && <Badge value="rejected" label="Exhausted" />}
                    {low && <Badge value="high" label="Low" />}
                    <Link href={`/deposits/${d.id}`} className="text-xs font-bold text-brand-700 hover:underline">
                      Open
                    </Link>
                  </span>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
