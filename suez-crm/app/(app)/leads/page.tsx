import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { money, timeAgo, titleCase } from "@/lib/format";
import { scoreBand } from "@/lib/scoring";
import { Avatar, Badge, BtnLink, Card, Empty, Field, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionForm, ConfirmBtn, Dialog, SubmitBtn } from "@/components/form";
import { Icon } from "@/components/icons";
import { LeadForm } from "@/components/sales-forms";
import { convertLead, deleteLead, saveLead } from "@/lib/actions/sales";

export const metadata = { title: "Leads" };

const BANDS: Record<string, string> = { hot: "bg-rose-100 text-rose-700", warm: "bg-amber-100 text-amber-700", cold: "bg-slate-100 text-slate-600" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const { q = "", status = "" } = await searchParams;
  const like = `%${q}%`;

  const rows = await sql<{
    id: number; full_name: string; company_name: string | null; job_title: string | null; email: string | null;
    phone: string | null; source: string; status: string; score: number; industry: string | null;
    estimated_value: string; currency: string; notes: string | null; owner_id: number | null;
    owner: string | null; owner_avatar: string | null; created_at: string;
  }>`
    select l.*, u.full_name as owner, u.avatar_url as owner_avatar
      from crm_leads l left join users u on u.id = l.owner_id
     where (${q} = '' or l.full_name ilike ${like} or l.company_name ilike ${like} or l.email ilike ${like})
       and (${status} = '' or l.status = ${status})
     order by l.status = 'converted', l.score desc, l.created_at desc
     limit 300`;

  const [stats] = await sql<{ open: number; hot: number; pipeline: string; converted: number }>`
    select count(*) filter (where status not in ('converted','unqualified'))::int as open,
           count(*) filter (where score >= 70 and status not in ('converted','unqualified'))::int as hot,
           coalesce(sum(estimated_value) filter (where status not in ('converted','unqualified')), 0) as pipeline,
           count(*) filter (where status = 'converted')::int as converted
      from crm_leads`;

  const owners = await sql<{ id: number; full_name: string }>`select id, full_name from users where status = 'active' order by full_name`;
  const ownerOpts = owners.map((o) => ({ id: o.id, label: o.full_name }));

  return (
    <>
      <PageHeader title="Leads" subtitle="Unqualified interest, scored so the team works the best ones first.">
        <BtnLink href="/api/export/crm-leads" variant="ghost" prefetch={false}>Export CSV</BtnLink>
        <BtnLink href="/import" variant="ghost">Import from Excel</BtnLink>
        <LeadForm action={saveLead} owners={ownerOpts} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Open leads" value={stats.open} />
        <Stat label="Hot (70+)" value={stats.hot} tone="rose" />
        <Stat label="Estimated value" value={money(stats.pipeline)} tone="sky" />
        <Stat label="Converted" value={stats.converted} tone="emerald" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset">
          {["", "new", "contacted", "qualified", "unqualified", "converted"].map((s) => (
            <Link key={s || "all"} href={s ? `/leads?status=${s}` : "/leads"}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${status === s ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"}`}>
              {s ? titleCase(s) : "All"}
            </Link>
          ))}
        </div>
        <form className="relative ml-auto">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Search name, company or email…" className="field pl-9 sm:w-72" />
          <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
        </form>
      </div>

      {rows.length === 0 ? (
        <Card><Empty title="No leads yet" hint="Add one, or import a list your team collected at an event." /></Card>
      ) : (
        <Table head={["Score", "Lead", "Company", "Source", "Value", "Owner", "Status", ""]}>
          {rows.map((l) => {
            const band = scoreBand(l.score);
            return (
              <tr key={l.id} className="hover:bg-canvas">
                <Td>
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${BANDS[band]}`} title={`${band} lead`}>
                    {l.score}
                  </span>
                </Td>
                <Td>
                  <span className="font-bold">{l.full_name}</span>
                  {l.job_title && <span className="block text-xs text-ink-soft">{l.job_title}</span>}
                  {l.email && <span className="block text-xs text-ink-soft">{l.email}</span>}
                </Td>
                <Td>{l.company_name ?? "—"}{l.industry && <span className="block text-xs text-ink-soft">{l.industry}</span>}</Td>
                <Td className="text-xs">{titleCase(l.source)}<span className="block text-ink-soft">{timeAgo(l.created_at)}</span></Td>
                <Td className="tabular">{money(l.estimated_value, l.currency)}</Td>
                <Td>{l.owner ? <span className="flex items-center gap-2"><Avatar name={l.owner} src={l.owner_avatar} size="sm" />{l.owner}</span> : "—"}</Td>
                <Td><Badge value={l.status} /></Td>
                <Td>
                  <span className="flex gap-1">
                    {l.status !== "converted" && (
                      <>
                        {/* ponytail: Convert used to fire on a single click with no
                            chance to set the close date and no way back — it creates an
                            account, a contact and an opportunity in one irreversible go. */}
                        <Dialog label="Convert" variant="soft" title={`Convert ${l.full_name}`}
                                description="Creates the account and contact if they are new, and opens an opportunity.">
                          <ActionForm action={convertLead} className="space-y-4">
                            <input type="hidden" name="id" value={l.id} />
                            <Field label="Opportunity name">
                              <input name="title" className="field"
                                     defaultValue={`${l.company_name || l.full_name} — initial opportunity`} />
                            </Field>
                            <Field label="Expected close" hint="A deal with no close date cannot be forecast.">
                              <input name="expected_close" type="date" className="field"
                                     defaultValue={new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)} />
                            </Field>
                            <p className="rounded-xl bg-canvas p-3 text-xs font-medium text-ink-soft">
                              Value carries across as {money(l.estimated_value)}. The lead is marked converted and
                              cannot be converted again.
                            </p>
                            <SubmitBtn className="w-full">Convert lead</SubmitBtn>
                          </ActionForm>
                        </Dialog>
                        <LeadForm action={saveLead} owners={ownerOpts} lead={l} />
                        <ActionForm action={deleteLead}>
                          <input type="hidden" name="id" value={l.id} />
                          <ConfirmBtn title={`Delete ${l.full_name}?`}
                                      body="The lead and its score are removed. This cannot be undone."
                                      confirmLabel="Delete lead">
                            ×
                          </ConfirmBtn>
                        </ActionForm>
                      </>
                    )}
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
