import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate, money, timeAgo, titleCase } from "@/lib/format";
import { Badge, Card, CardTitle, Empty, Field, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, Select, SubmitBtn } from "@/components/form";
import { buildAudience, sendCampaign } from "@/lib/actions/sales";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ name: string }>`select name from crm_campaigns where id = ${Number(id)}`;
  return { title: r ? r.name : "Not found" };
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const [c] = await sql<{
    id: number; name: string; channel: string; status: string; start_date: string | null; end_date: string | null;
    budget: string; currency: string; subject: string | null; body: string | null; owner: string | null;
  }>`select c.*, u.full_name as owner from crm_campaigns c left join users u on u.id = c.owner_id where c.id = ${Number(id)}`;
  if (!c) notFound();

  const [recipients, counts] = await Promise.all([
    sql<{ id: number; email: string; sent_at: string | null; opened_at: string | null; clicked_at: string | null; bounced: boolean; contact: string | null; company: string | null }>`
      select r.*, ct.full_name as contact, co.name as company
        from crm_campaign_recipients r
        left join crm_contacts ct on ct.id = r.contact_id
        left join crm_companies co on co.id = ct.company_id
       where r.campaign_id = ${c.id} order by ct.full_name nulls last limit 200`,
    sql<{ total: number; sent: number; opened: number; clicked: number; bounced: number }>`
      select count(*)::int as total,
             count(*) filter (where sent_at is not null)::int as sent,
             count(*) filter (where opened_at is not null)::int as opened,
             count(*) filter (where clicked_at is not null)::int as clicked,
             count(*) filter (where bounced)::int as bounced
        from crm_campaign_recipients where campaign_id = ${c.id}`,
  ]);
  const k = counts[0];

  return (
    <>
      <PageHeader title={c.name} subtitle={`${titleCase(c.channel)} · ${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}${c.owner ? ` · ${c.owner}` : ""}`}>
        <Badge value={c.status} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Audience" value={k.total} />
        <Stat label="Opened" value={k.total ? `${Math.round((k.opened / k.total) * 100)}%` : "—"} tone="emerald" />
        <Stat label="Clicked" value={k.total ? `${Math.round((k.clicked / k.total) * 100)}%` : "—"} tone="sky" />
        <Stat label="Budget" value={money(c.budget, c.currency)} tone="amber" />
      </div>

      {(c.subject || c.body) && (
        <Card className="mb-5">
          <CardTitle>Message</CardTitle>
          {c.subject && <p className="font-bold">{c.subject}</p>}
          {c.body && <p className="mt-2 text-sm font-medium whitespace-pre-wrap">{c.body}</p>}
        </Card>
      )}

      <Card className="mb-5">
        <CardTitle>Build the audience</CardTitle>
        <p className="mb-3 text-sm font-medium text-ink-soft">
          Adds contacts with an email address who have not opted out. Running it again tops the list up rather than duplicating it.
        </p>
        <ActionForm action={buildAudience} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={c.id} />
          <Field label="Limit to relationship">
            <Select name="company_status" className="field w-48" defaultValue="">
              <option value="">Every contact</option>
              {["lead", "prospect", "customer", "churned"].map((s) => <option key={s} value={s}>{titleCase(s)} accounts</option>)}
            </Select>
          </Field>
          <SubmitBtn>Add to audience</SubmitBtn>
        </ActionForm>
      </Card>

      {c.channel === "email" && k.total > k.sent && (
        <Card className="mb-5">
          <CardTitle>Send campaign</CardTitle>
          <p className="mb-3 text-sm font-medium text-ink-soft">Sends through the CRM SMTP account to {k.total-k.sent} unsent recipient(s). Previously sent recipients are skipped.</p>
          <ActionForm action={sendCampaign}><input type="hidden" name="id" value={c.id}/><ConfirmBtn title="Send this campaign?" body={`This will send ${k.total-k.sent} real email(s).`} confirmLabel="Send now" variant="primary">Send to unsent audience</ConfirmBtn></ActionForm>
        </Card>
      )}

      <Card>
        <CardTitle>Recipients</CardTitle>
        {recipients.length === 0 ? (
          <Empty title="No audience yet" hint="Build one from your contacts above." />
        ) : (
          <Table head={["Contact", "Company", "Email", "Sent", "Opened", "Clicked", ""]}>
            {recipients.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <Td>{r.contact ?? "—"}</Td>
                <Td>{r.company ?? "—"}</Td>
                <Td className="text-xs">{r.email}</Td>
                <Td className="text-xs">{r.sent_at ? timeAgo(r.sent_at) : "—"}</Td>
                <Td className="text-xs">{r.opened_at ? timeAgo(r.opened_at) : "—"}</Td>
                <Td className="text-xs">{r.clicked_at ? timeAgo(r.clicked_at) : "—"}</Td>
                <Td>{r.bounced && <Badge value="rejected" label="Bounced" />}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Link href="/campaigns" className="mt-5 block text-xs font-bold text-brand-700 hover:underline">← All campaigns</Link>
    </>
  );
}
