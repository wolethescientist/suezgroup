import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, titleCase } from "@/lib/format";
import { Badge, BtnLink, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, SubmitBtn } from "@/components/form";
import { CampaignForm } from "@/components/sales-forms";
import { deleteCampaign, saveCampaign } from "@/lib/actions/sales";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await requireUser();

  const rows = await sql<{
    id: number; name: string; channel: string; status: string; start_date: string | null; end_date: string | null;
    budget: string; currency: string; subject: string | null; body: string | null; owner: string | null;
    recipients: number; opened: number;
  }>`
    select c.*, u.full_name as owner,
           (select count(*) from crm_campaign_recipients r where r.campaign_id = c.id)::int as recipients,
           (select count(*) from crm_campaign_recipients r where r.campaign_id = c.id and r.opened_at is not null)::int as opened
      from crm_campaigns c left join users u on u.id = c.owner_id
     order by c.start_date desc nulls last, c.id desc`;

  const [stats] = await sql<{ running: number; spend: string; reach: number }>`
    select count(*) filter (where status = 'running')::int as running,
           coalesce(sum(budget), 0) as spend,
           (select count(*) from crm_campaign_recipients)::int as reach
      from crm_campaigns`;

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Marketing activity, its audience and what it cost.">
        <BtnLink href="/api/export/crm-campaigns" variant="ghost" prefetch={false}>Export CSV</BtnLink>
        <CampaignForm action={saveCampaign} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Running now" value={stats.running} />
        <Stat label="Committed budget" value={money(stats.spend)} tone="sky" />
        <Stat label="Total audience" value={stats.reach} tone="emerald" />
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No campaigns yet" hint="Create one, build its audience from your contacts, then track it here." /></Card>
      ) : (
        <Table head={["Campaign", "Channel", "Runs", "Audience", "Opened", "Budget", "Status", ""]}>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-canvas">
              <Td><Link href={`/campaigns/${c.id}`} className="font-bold text-brand-700 hover:underline">{c.name}</Link></Td>
              <Td>{titleCase(c.channel)}</Td>
              <Td className="text-xs">{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</Td>
              <Td className="tabular">{c.recipients}</Td>
              <Td className="tabular">{c.recipients ? `${Math.round((c.opened / c.recipients) * 100)}%` : "—"}</Td>
              <Td className="tabular">{money(c.budget, c.currency)}</Td>
              <Td><Badge value={c.status} /></Td>
              <Td>
                <span className="flex gap-1">
                  <CampaignForm action={saveCampaign} campaign={c} />
                  <ActionForm action={deleteCampaign}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmBtn title={`Delete ${c.name}?`}
                                body="The campaign and its audience list are removed. This cannot be undone."
                                confirmLabel="Delete campaign">
                      ×
                    </ConfirmBtn>
                  </ActionForm>
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
