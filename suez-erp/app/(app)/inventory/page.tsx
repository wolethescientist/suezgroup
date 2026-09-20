import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { money, timeAgo, titleCase } from "@/lib/format";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ItemForm, StockForm } from "@/components/erp-forms";
import { moveStock, saveItem } from "@/lib/actions/supply";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const me = await requireUser();
  const { q = "", low = "" } = await searchParams;
  const like = `%${q}%`;
  const canEdit = can(me, "inventory.manage");

  const rows = await sql<{
    id: number; sku: string; name: string; category: string | null; unit: string; quantity: string;
    reorder_level: string; unit_cost: string; currency: string; status: string; warehouse: string | null; warehouse_id: number | null;
  }>`
    select i.*, w.name as warehouse from inventory_items i
      left join warehouses w on w.id = i.warehouse_id
     where (${q} = '' or i.name ilike ${like} or i.sku ilike ${like} or i.category ilike ${like})
       and (${low} = '' or i.quantity <= i.reorder_level)
     order by (i.quantity <= i.reorder_level) desc, i.name limit 300`;

  const [stats] = await sql<{ items: number; value: string; low: number }>`
    select count(*)::int as items,
           coalesce(sum(quantity * unit_cost), 0) as value,
           count(*) filter (where quantity <= reorder_level)::int as low
      from inventory_items where status = 'active'`;

  const [warehouses, movements] = await Promise.all([
    sql<{ id: number; name: string }>`select id, name from warehouses order by name`,
    sql<{ id: number; kind: string; quantity: string; reason: string | null; created_at: string; item: string; who: string | null }>`
      select m.id, m.kind, m.quantity, m.reason, m.created_at, i.name as item, u.full_name as who
        from stock_movements m
        join inventory_items i on i.id = m.item_id
        left join users u on u.id = m.moved_by
       order by m.created_at desc limit 12`,
  ]);

  const whOpts = warehouses.map((w) => ({ id: w.id, label: w.name }));

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock on hand, reorder levels and every movement in or out.">
        {canEdit && <ItemForm action={saveItem} warehouses={whOpts} />}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Active items" value={stats.items} />
        <Stat label="Stock value" value={money(stats.value)} tone="emerald" />
        <Stat label="At or below reorder level" value={stats.low} tone={stats.low ? "rose" : "sky"} />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <input name="q" defaultValue={q} placeholder="Search SKU, name or category…" className="field pl-9" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
          <input type="checkbox" name="low" value="1" defaultChecked={!!low} className="h-4 w-4 rounded" /> Only low stock
        </label>
        <button type="submit" className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">Filter</button>
      </form>

      {rows.length === 0 ? (
        <Card><Empty title="Nothing in stock" hint="Add items, or import your stock list from a spreadsheet." /></Card>
      ) : (
        <Table head={["SKU", "Item", "Location", "On hand", "Reorder at", "Unit cost", "Value", ""]}>
          {rows.map((i) => {
            const isLow = Number(i.quantity) <= Number(i.reorder_level);
            return (
              <tr key={i.id} className="hover:bg-canvas">
                <Td className="font-mono text-xs font-bold">{i.sku}</Td>
                <Td>
                  <span className="font-bold">{i.name}</span>
                  {i.category && <span className="block text-xs text-ink-soft">{i.category}</span>}
                </Td>
                <Td>{i.warehouse ?? "—"}</Td>
                <Td className="tabular">
                  <span className={isLow ? "font-bold text-rose-700" : "font-bold"}>{Number(i.quantity)}</span>
                  <span className="text-ink-soft"> {i.unit}</span>
                  {isLow && <Badge value="low" label="Reorder" className="ml-2" />}
                </Td>
                <Td className="tabular">{Number(i.reorder_level)}</Td>
                <Td className="tabular">{money(i.unit_cost, i.currency)}</Td>
                <Td className="tabular font-bold">{money(Number(i.quantity) * Number(i.unit_cost), i.currency)}</Td>
                <Td>
                  {canEdit && (
                    <span className="flex gap-1">
                      <StockForm action={moveStock} itemId={i.id} itemName={i.name} onHand={Number(i.quantity)} />
                      <ItemForm action={saveItem} warehouses={whOpts} item={i} />
                    </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {movements.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Recent movements</CardTitle>
          <ul className="divide-y divide-line">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Badge value={m.kind === "in" ? "approved" : m.kind === "out" ? "pending" : "draft"} label={m.kind === "in" ? "In" : m.kind === "out" ? "Out" : "Adjust"} />
                <span className="min-w-0 flex-1 truncate font-semibold">{m.item}</span>
                <span className="tabular font-bold">{Number(m.quantity)}</span>
                <span className="hidden text-xs font-medium text-ink-soft sm:block">{m.reason ?? "—"}</span>
                <span className="text-xs font-medium text-ink-soft">{m.who ?? "—"} · {timeAgo(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
