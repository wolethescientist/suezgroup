import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, titleCase } from "@/lib/format";
import { netBookValue } from "@/lib/money";
import { Avatar, Badge, Card, CardTitle, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { AssetForm, AssignAssetForm } from "@/components/erp-forms";
import { assignAsset, returnAsset, saveAsset } from "@/lib/actions/supply";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ tag: string; name: string }>`select tag, name from assets where id = ${Number(id)}`;
  return { title: r ? `${r.tag} — ${r.name}` : "Not found" };
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;

  const [a] = await sql<{
    id: number; tag: string; name: string; category: string; serial_no: string | null; purchase_date: string | null;
    purchase_cost: string; currency: string; useful_life_years: number; vendor_id: number | null; vendor: string | null;
    location: string | null; status: string; notes: string | null;
  }>`
    select a.*, v.name as vendor from assets a left join vendors v on v.id = a.vendor_id where a.id = ${Number(id)}`;
  if (!a) notFound();

  const [history, users, vendors] = await Promise.all([
    sql<{ id: number; assigned_on: string; returned_on: string | null; condition: string | null; note: string | null; holder: string | null; holder_avatar: string | null }>`
      select aa.*, u.full_name as holder, u.avatar_url as holder_avatar
        from asset_assignments aa left join users u on u.id = aa.user_id
       where aa.asset_id = ${a.id} order by aa.assigned_on desc, aa.id desc`,
    sql<{ id: number; full_name: string }>`select id, full_name from users where status = 'active' order by full_name`,
    sql<{ id: number; name: string }>`select id, name from vendors order by name`,
  ]);

  const canEdit = can(me, "asset.manage");
  const current = history.find((h) => !h.returned_on);

  const nbv = netBookValue(Number(a.purchase_cost), a.purchase_date, a.useful_life_years);

  return (
    <>
      <PageHeader title={`${a.tag} — ${a.name}`} subtitle={`${titleCase(a.category)}${a.serial_no ? ` · S/N ${a.serial_no}` : ""}${a.location ? ` · ${a.location}` : ""}`}>
        <Badge value={a.status} />
        {canEdit && <AssetForm action={saveAsset} vendors={vendors.map((v) => ({ id: v.id, label: v.name }))} asset={a} />}
        {canEdit && a.status !== "disposed" && (
          current ? (
            <ActionForm action={returnAsset}>
              <input type="hidden" name="asset_id" value={a.id} />
              <SubmitBtn variant="ghost">Mark returned</SubmitBtn>
            </ActionForm>
          ) : (
            <AssignAssetForm action={assignAsset} assetId={a.id} users={users.map((u) => ({ id: u.id, label: u.full_name }))} />
          )
        )}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Purchase cost" value={money(a.purchase_cost, a.currency)} />
        <Stat label="Net book value" value={money(nbv, a.currency)} tone="emerald" hint={`${a.useful_life_years}-year life`} />
        <Stat label="Purchased" value={fmtDate(a.purchase_date)} tone="sky" />
        <Stat label="Supplier" value={a.vendor ?? "—"} tone="amber" />
      </div>

      <Card>
        <CardTitle>Assignment history</CardTitle>
        {history.length === 0 ? (
          <p className="text-sm font-medium text-ink-soft">This asset has never been assigned.</p>
        ) : (
          <Table head={["Held by", "From", "Returned", "Condition", "Note"]}>
            {history.map((h) => (
              <tr key={h.id} className={h.returned_on ? "" : "bg-brand-50/40"}>
                <Td>{h.holder ? <span className="flex items-center gap-2"><Avatar name={h.holder} src={h.holder_avatar} size="sm" />{h.holder}</span> : "—"}</Td>
                <Td>{fmtDate(h.assigned_on)}</Td>
                <Td>{h.returned_on ? fmtDate(h.returned_on) : <Badge value="active" label="Current" />}</Td>
                <Td>{h.condition ?? "—"}</Td>
                <Td className="text-xs">{h.note ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
        {a.notes && <p className="mt-4 border-t border-line pt-3 text-sm font-medium text-ink-soft whitespace-pre-wrap">{a.notes}</p>}
        <Link href="/assets" className="mt-4 block text-xs font-bold text-brand-700 hover:underline">← All assets</Link>
      </Card>
    </>
  );
}
