import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, titleCase } from "@/lib/format";
import { Avatar, Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AssetForm } from "@/components/erp-forms";
import { saveAsset } from "@/lib/actions/supply";

export const metadata = { title: "Assets" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const me = await requireUser();
  const { q = "", status = "" } = await searchParams;
  const like = `%${q}%`;
  const canEdit = can(me, "asset.manage");

  const rows = await sql<{
    id: number; tag: string; name: string; category: string; serial_no: string | null; purchase_date: string | null;
    purchase_cost: string; currency: string; useful_life_years: number; location: string | null; status: string;
    holder: string | null; holder_avatar: string | null;
  }>`
    select a.*, u.full_name as holder, u.avatar_url as holder_avatar
      from assets a
      left join asset_assignments aa on aa.asset_id = a.id and aa.returned_on is null
      left join users u on u.id = aa.user_id
     where (${q} = '' or a.name ilike ${like} or a.tag ilike ${like} or a.serial_no ilike ${like})
       and (${status} = '' or a.status = ${status})
     order by a.tag limit 300`;

  const [stats] = await sql<{ total: number; assigned: number; cost: string; nbv: string }>`
    select count(*)::int as total,
           count(*) filter (where status = 'assigned')::int as assigned,
           coalesce(sum(purchase_cost), 0) as cost,
           -- Straight-line depreciation, floored at zero.
           coalesce(sum(greatest(0, purchase_cost - purchase_cost *
             least(1, extract(epoch from (now() - coalesce(purchase_date, current_date)))
                      / nullif(useful_life_years * 31557600, 0)))), 0) as nbv
      from assets where status <> 'disposed'`;

  const vendors = await sql<{ id: number; name: string }>`select id, name from vendors order by name`;

  return (
    <>
      <PageHeader title="Assets" subtitle="Fixed asset register, who holds what, and net book value.">
        <BtnLink href="/api/export/assets" variant="ghost" prefetch={false}>Export CSV</BtnLink>
        {canEdit && <AssetForm action={saveAsset} vendors={vendors.map((v) => ({ id: v.id, label: v.name }))} />}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Assets" value={stats.total} />
        <Stat label="Currently assigned" value={stats.assigned} tone="sky" />
        <Stat label="Purchase cost" value={money(stats.cost)} />
        <Stat label="Net book value" value={money(stats.nbv)} tone="emerald" hint="Straight-line" />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <input name="q" defaultValue={q} placeholder="Search tag, name or serial…" className="field pl-9" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </div>
        <select name="status" defaultValue={status} className="field w-40">
          <option value="">Any status</option>
          {["in_store", "assigned", "maintenance", "retired", "disposed"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <button type="submit" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">Filter</button>
      </form>

      {rows.length === 0 ? (
        <Card><Empty title="No assets recorded" hint="Add them one by one, or import your register from a spreadsheet." /></Card>
      ) : (
        <Table head={["Tag", "Asset", "Category", "Held by", "Purchased", "Cost", "Status"]}>
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-canvas">
              <Td><Link href={`/assets/${a.id}`} className="font-mono text-xs font-bold text-brand-700 hover:underline">{a.tag}</Link></Td>
              <Td>
                <span className="font-bold">{a.name}</span>
                {a.serial_no && <span className="block text-xs text-ink-soft">S/N {a.serial_no}</span>}
              </Td>
              <Td>{titleCase(a.category)}</Td>
              <Td>{a.holder ? <span className="flex items-center gap-2"><Avatar name={a.holder} src={a.holder_avatar} size="sm" />{a.holder}</span> : <span className="text-ink-soft">—</span>}</Td>
              <Td>{fmtDate(a.purchase_date)}</Td>
              <Td className="tabular">{money(a.purchase_cost, a.currency)}</Td>
              <Td><Badge value={a.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
