import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { crmOptions } from "@/lib/crm";
import { deleteDeal, moveDeal, toggleActivity } from "@/lib/actions/crm";
import { fmtDate, fmtDateTime, money, timeAgo, titleCase } from "@/lib/format";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { ActivityForm, DealForm } from "@/components/crm-forms";
import { Avatar, Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { StageSelect } from "@/components/stage-select";
import { Icon } from "@/components/icons";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ title: string }>`select title from crm_deals where id = ${Number(id)}`;
  return { title: r ? r.title : "Not found" };
}

export default async function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [[deal], activities, options] = await Promise.all([
    sql<any>`
      select d.*, c.name as company, c.id as company_id, ct.full_name as contact, ct.email as contact_email,
             ct.phone as contact_phone, u.full_name as owner
        from crm_deals d
        left join crm_companies c on c.id = d.company_id
        left join crm_contacts ct on ct.id = d.contact_id
        left join users u on u.id = d.owner_id
       where d.id = ${id}`,
    sql<{ id: number; kind: string; subject: string; notes: string | null; due_at: string | null; completed_at: string | null; owner: string | null }>`
      select a.id, a.kind, a.subject, a.notes, a.due_at, a.completed_at, u.full_name as owner
        from crm_activities a left join users u on u.id = a.owner_id
       where a.deal_id = ${id} order by coalesce(a.due_at, a.created_at) desc`,
    crmOptions(),
  ]);
  if (!deal) notFound();

  return (
    <>
      <Link href="/deals" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
        ← Back to pipeline
      </Link>

      <PageHeader
        title={deal.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge value={deal.stage} />
            <span>
              {deal.company ?? "No company"} · closes {fmtDate(deal.expected_close)} · owner {deal.owner ?? "unassigned"}
            </span>
          </span>
        }
      >
        <Dialog label="Log activity" variant="outline" title="Log activity" width="max-w-xl">
          <ActivityForm {...options} presetDeal={deal.id} presetCompany={deal.company_id ?? undefined} />
        </Dialog>
        <Dialog label="Edit" title="Edit opportunity" width="max-w-xl">
          <DealForm {...options} record={deal} />
        </Dialog>
        {can(me, "record.delete") && (
          <Dialog label="Delete" variant="danger" title="Delete opportunity" description="This removes the deal and its activities.">
            <ActionForm action={deleteDeal} className="space-y-4">
              <input type="hidden" name="id" value={deal.id} />
              <p className="text-sm font-medium text-ink-soft">This cannot be undone.</p>
              <SubmitBtn variant="danger" className="w-full">
                Delete permanently
              </SubmitBtn>
            </ActionForm>
          </Dialog>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Value</p>
                <p className="mt-1 text-2xl font-bold tabular">{money(deal.value, deal.currency)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Probability</p>
                <p className="mt-1 text-2xl font-bold tabular">{deal.probability}%</p>
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-wider text-ink-soft uppercase">Weighted</p>
                <p className="mt-1 text-2xl font-bold tabular">
                  {money((Number(deal.value) * deal.probability) / 100, deal.currency)}
                </p>
              </div>
            </div>
            <div className="mt-5 max-w-xs border-t border-line pt-4">
              <p className="mb-1.5 text-[11px] font-bold tracking-wider text-ink-soft uppercase">Stage</p>
              <StageSelect action={moveDeal} id={deal.id} stage={deal.stage} stages={options.stages} />
            </div>
            {deal.notes && (
              <p className="mt-5 rounded-xl bg-canvas p-3 text-sm font-medium whitespace-pre-wrap">{deal.notes}</p>
            )}
          </Card>

          <Card>
            <CardTitle>Activity history</CardTitle>
            {activities.length === 0 ? (
              <p className="pb-2 text-sm font-medium text-ink-soft">No activity logged for this opportunity yet.</p>
            ) : (
              <ul className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <ActionForm action={toggleActivity}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        title={a.completed_at ? "Mark as outstanding" : "Mark as done"}
                        className={`mt-0.5 grid h-7 w-7 place-items-center rounded-lg transition ${
                          a.completed_at ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                        }`}
                      >
                        <Icon name="check" />
                      </button>
                    </ActionForm>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${a.completed_at ? "text-ink-soft line-through" : ""}`}>{a.subject}</p>
                      <p className="text-xs font-medium text-ink-soft">
                        {titleCase(a.kind)} · {a.owner ?? "Unassigned"} ·{" "}
                        {a.completed_at ? `completed ${timeAgo(a.completed_at)}` : a.due_at ? `due ${fmtDateTime(a.due_at)}` : "no date"}
                      </p>
                      {a.notes && <p className="mt-1 text-sm font-medium whitespace-pre-wrap">{a.notes}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Account</CardTitle>
            {deal.company_id ? (
              <Link href={`/companies/${deal.company_id}`} className="block rounded-xl bg-canvas p-3 hover:bg-brand-50">
                <p className="text-sm font-bold">{deal.company}</p>
                <p className="text-xs font-medium text-ink-soft">View account →</p>
              </Link>
            ) : (
              <p className="text-sm font-medium text-ink-soft">Not linked to a company.</p>
            )}

            {deal.contact && (
              <div className="mt-4 flex items-start gap-3 border-t border-line pt-4">
                <Avatar name={deal.contact} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-bold">{deal.contact}</p>
                  {deal.contact_email && (
                    <a href={`mailto:${deal.contact_email}`} className="block truncate text-xs font-semibold text-brand-700 hover:underline">
                      {deal.contact_email}
                    </a>
                  )}
                  {deal.contact_phone && <p className="text-xs font-medium text-ink-soft">{deal.contact_phone}</p>}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>Record</CardTitle>
            <dl className="space-y-3 text-sm">
              {[
                ["Owner", deal.owner ?? "—"],
                ["Created", fmtDate(deal.created_at)],
                ["Last updated", fmtDate(deal.updated_at)],
                ["Expected close", fmtDate(deal.expected_close)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="font-medium text-ink-soft">{k}</dt>
                  <dd className="text-right font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
