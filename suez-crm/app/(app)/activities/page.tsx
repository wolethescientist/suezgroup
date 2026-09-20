import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { crmOptions } from "@/lib/crm";
import { toggleActivity } from "@/lib/actions/crm";
import { fmtDateTime, timeAgo, titleCase } from "@/lib/format";
import { ActionForm, Dialog } from "@/components/form";
import { ActivityForm } from "@/components/crm-forms";
import { Badge, BtnLink, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "CRM activities" };

const TABS = [
  ["mine", "My open tasks"],
  ["overdue", "Overdue"],
  ["done", "Completed"],
  ["all", "Everything"],
] as const;

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const { tab = "mine" } = await searchParams;

  const [rows, options] = await Promise.all([
    sql<{
      id: number; kind: string; subject: string; notes: string | null; due_at: string | null; completed_at: string | null;
      owner: string | null; deal: string | null; deal_id: number | null; company: string | null; company_id: number | null; contact: string | null;
    }>`
      select a.id, a.kind, a.subject, a.notes, a.due_at, a.completed_at, u.full_name as owner,
             d.title as deal, d.id as deal_id, c.name as company, c.id as company_id, ct.full_name as contact
        from crm_activities a
        left join users u on u.id = a.owner_id
        left join crm_deals d on d.id = a.deal_id
        left join crm_companies c on c.id = a.company_id
        left join crm_contacts ct on ct.id = a.contact_id
       where case ${tab}
               when 'mine'    then a.owner_id = ${me.id} and a.completed_at is null
               when 'overdue' then a.completed_at is null and a.due_at < now()
               when 'done'    then a.completed_at is not null
               else true
             end
       order by a.completed_at nulls first, a.due_at nulls last, a.created_at desc`,
    crmOptions(),
  ]);

  return (
    <>
      <PageHeader title="Activities" subtitle="Calls, meetings, emails and follow-ups against every account.">
        <BtnLink href="/api/export/crm-activities" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <Dialog label={<><Icon name="plus" /> Log activity</>} title="Log activity" width="max-w-xl">
          <ActivityForm {...options} />
        </Dialog>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line ring-inset sm:w-fit">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/activities?tab=${key}`}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              tab === key ? "bg-brand-500 text-on-brand" : "text-ink-soft hover:bg-canvas"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <Empty title="Nothing here" hint="Log a call, meeting or follow-up task against an account." />
        </Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map((a) => {
            const overdue = !a.completed_at && a.due_at && new Date(a.due_at) < new Date();
            return (
              <li key={a.id} className="card flex items-start gap-4 p-4">
                <ActionForm action={toggleActivity}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    title={a.completed_at ? "Reopen" : "Mark as done"}
                    className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                      a.completed_at ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                    }`}
                  >
                    <Icon name="check" className="h-5 w-5" />
                  </button>
                </ActionForm>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-bold ${a.completed_at ? "text-ink-soft line-through" : ""}`}>{a.subject}</p>
                    <Badge value={a.kind} />
                    {overdue && <Badge value="overdue" label="Overdue" />}
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-ink-soft">
                    {titleCase(a.kind)} · {a.owner ?? "Unassigned"} ·{" "}
                    {a.completed_at
                      ? `completed ${timeAgo(a.completed_at)}`
                      : a.due_at
                        ? `due ${fmtDateTime(a.due_at)}`
                        : "no date set"}
                  </p>
                  {a.notes && <p className="mt-1.5 text-sm font-medium whitespace-pre-wrap">{a.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
                    {a.deal_id && (
                      <Link href={`/deals/${a.deal_id}`} className="text-brand-700 hover:underline">
                        {a.deal}
                      </Link>
                    )}
                    {a.company_id && (
                      <Link href={`/companies/${a.company_id}`} className="text-brand-700 hover:underline">
                        {a.company}
                      </Link>
                    )}
                    {a.contact && <span className="text-ink-soft">{a.contact}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
