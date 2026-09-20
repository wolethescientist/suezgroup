import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { crmOptions } from "@/lib/crm";
import { deleteCompany } from "@/lib/actions/crm";
import { compactMoney, fmtDate, money, timeAgo, titleCase } from "@/lib/format";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { ActivityForm, CompanyForm, ContactForm, DealForm } from "@/components/crm-forms";
import { Avatar, Badge, Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { listDeposits, remainingRatio } from "@/lib/deposits";
import { Icon } from "@/components/icons";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ name: string }>`select name from crm_companies where id = ${Number(id)}`;
  return { title: r ? r.name : "Not found" };
}

export default async function CompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [[c], contacts, deals, activities, options, deposits] = await Promise.all([
    sql<any>`
      select c.*, u.full_name as owner from crm_companies c left join users u on u.id = c.owner_id where c.id = ${id}`,
    sql<{ id: number; full_name: string; job_title: string | null; email: string | null; phone: string | null; is_primary: boolean }>`
      select id, full_name, job_title, email, phone, is_primary from crm_contacts where company_id = ${id} order by is_primary desc, full_name`,
    sql<{ id: number; title: string; value: string; stage: string; probability: number; expected_close: string | null }>`
      select id, title, value, stage, probability, expected_close from crm_deals where company_id = ${id} order by value desc`,
    sql<{ id: number; kind: string; subject: string; due_at: string | null; completed_at: string | null; owner: string | null }>`
      select a.id, a.kind, a.subject, a.due_at, a.completed_at, u.full_name as owner
        from crm_activities a left join users u on u.id = a.owner_id
       where a.company_id = ${id} order by coalesce(a.due_at, a.created_at) desc limit 12`,
    crmOptions(),
    listDeposits(me, { companyId: id }),
  ]);
  if (!c) notFound();

  const open = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const won = deals.filter((d) => d.stage === "won");

  return (
    <>
      <Link href="/companies" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
        ← Back to companies
      </Link>

      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge value={c.status} />
            <span>
              {c.industry ?? "Industry unknown"} · {c.size ?? "size unknown"} · owner {c.owner ?? "unassigned"}
            </span>
          </span>
        }
      >
        <Dialog label="Log activity" variant="outline" title="Log activity" width="max-w-xl">
          <ActivityForm {...options} presetCompany={c.id} />
        </Dialog>
        <Dialog label="Add contact" variant="outline" title="Add contact">
          <ContactForm companies={options.companies} owners={options.owners} record={{ company_id: c.id }} />
        </Dialog>
        <Dialog label="Edit" title="Edit company">
          <CompanyForm owners={options.owners} record={c} />
        </Dialog>
        {can(me, "record.delete") && (
          <Dialog label="Delete" variant="danger" title="Delete company" description="Contacts and deals lose their link.">
            <ActionForm action={deleteCompany} className="space-y-4">
              <input type="hidden" name="id" value={c.id} />
              <p className="text-sm font-medium text-ink-soft">This cannot be undone.</p>
              <SubmitBtn variant="danger" className="w-full">
                Delete permanently
              </SubmitBtn>
            </ActionForm>
          </Dialog>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open pipeline" value={compactMoney(open.reduce((s, d) => s + Number(d.value), 0))} hint={`${open.length} opportunities`} />
        <Stat label="Closed won" value={compactMoney(won.reduce((s, d) => s + Number(d.value), 0))} hint={`${won.length} deals`} tone="emerald" />
        <Stat label="Contacts" value={contacts.length} hint="On file" tone="sky" />
        {deposits.length > 0 ? (
          <Stat
            label="On deposit"
            value={compactMoney(deposits.reduce((s, d) => s + Number(d.balance), 0))}
            hint={`${deposits.length} account${deposits.length === 1 ? "" : "s"} · ${compactMoney(
              deposits.reduce((s, d) => s + Number(d.drawn), 0),
            )} drawn`}
            tone="amber"
          />
        ) : (
          <Stat label="Activities" value={activities.length} hint="Recent touchpoints" tone="amber" />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle
              action={
                <Dialog label="New opportunity" variant="soft" className="!px-2.5 !py-1 !text-xs" title="Add opportunity" width="max-w-xl">
                  <DealForm {...options} record={{ company_id: c.id }} />
                </Dialog>
              }
            >
              Opportunities
            </CardTitle>
            {deals.length === 0 ? (
              <p className="pb-2 text-sm font-medium text-ink-soft">No opportunities recorded for this account.</p>
            ) : (
              <ul className="-mx-1 divide-y divide-line">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-canvas">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{d.title}</span>
                        <span className="block text-xs font-medium text-ink-soft">
                          {d.probability}% · closes {fmtDate(d.expected_close)}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular">{money(d.value)}</span>
                      <Badge value={d.stage} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Activity</CardTitle>
            {activities.length === 0 ? (
              <p className="pb-2 text-sm font-medium text-ink-soft">Nothing logged yet.</p>
            ) : (
              <ul className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                        a.completed_at ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"
                      }`}
                    >
                      <Icon name={a.kind === "call" ? "chat" : a.kind === "email" ? "mail" : a.kind === "meeting" ? "users" : "check"} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{a.subject}</span>
                      <span className="block text-xs font-medium text-ink-soft">
                        {titleCase(a.kind)} · {a.owner ?? "Unassigned"} ·{" "}
                        {a.completed_at ? `done ${timeAgo(a.completed_at)}` : a.due_at ? timeAgo(a.due_at) : "no date"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {deposits.length > 0 && (
            <Card>
              <CardTitle
                action={
                  <Link href="/deposits" className="text-xs font-bold text-brand-700 hover:underline">
                    All accounts
                  </Link>
                }
              >
                Deposit accounts
              </CardTitle>
              <ul className="-mx-1 divide-y divide-line">
                {deposits.map((d) => {
                  const funded = Number(d.funded);
                  const balance = Number(d.balance);
                  const left = remainingRatio(funded, balance);
                  const empty = balance <= 0;
                  const low = !empty && left <= Number(d.low_balance_ratio);
                  return (
                    <li key={d.id} className="px-1 py-3">
                      <Link href={`/deposits/${d.id}`} className="block hover:opacity-80">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold">{d.name}</span>
                          <span className={`text-sm font-bold tabular ${empty ? "text-rose-700" : low ? "text-amber-700" : "text-emerald-700"}`}>
                            {money(balance, d.currency)}
                          </span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
                          <span
                            className={`block h-full rounded-full ${empty ? "bg-rose-500" : low ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.max(left > 0 ? 3 : 0, left * 100)}%` }}
                          />
                        </span>
                        <span className="mt-1 block text-[11px] font-semibold text-ink-soft">
                          {d.ref} · {money(funded, d.currency)} funded · {Math.round(left * 100)}% left
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <CardTitle>Contacts</CardTitle>
            {contacts.length === 0 ? (
              <p className="text-sm font-medium text-ink-soft">No contacts yet.</p>
            ) : (
              <ul className="space-y-3">
                {contacts.map((p) => (
                  <li key={p.id} className="flex items-start gap-3">
                    <Avatar name={p.full_name} size="md" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-bold">
                        {p.full_name}
                        {p.is_primary && <Badge value="approved" label="Primary" />}
                      </p>
                      <p className="text-xs font-medium text-ink-soft">{p.job_title ?? "—"}</p>
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="block truncate text-xs font-semibold text-brand-700 hover:underline">
                          {p.email}
                        </a>
                      )}
                      {p.phone && <p className="text-xs font-medium text-ink-soft">{p.phone}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Account details</CardTitle>
            <dl className="space-y-3 text-sm">
              {[
                ["Email", c.email],
                ["Phone", c.phone],
                ["Website", c.website],
                ["Address", c.address],
                ["Headcount", c.size],
                ["Added", fmtDate(c.created_at)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4">
                  <dt className="shrink-0 font-medium text-ink-soft">{k}</dt>
                  <dd className="text-right font-bold break-words">{(v as string) || "—"}</dd>
                </div>
              ))}
            </dl>
            {c.notes && <p className="mt-4 rounded-xl bg-canvas p-3 text-sm font-medium whitespace-pre-wrap">{c.notes}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
