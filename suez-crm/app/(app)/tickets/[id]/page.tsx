import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, Field, PageHeader } from "@/components/ui";
import { ActionForm, Select, SubmitBtn } from "@/components/form";
import { replyToTicket } from "@/lib/actions/sales";

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ ref: string; subject: string }>`select ref, subject from crm_tickets where id = ${Number(id)}`;
  return { title: r ? `${r.ref} — ${r.subject}` : "Not found" };
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const [t] = await sql<{
    id: number; ref: string; subject: string; body: string | null; priority: string; status: string;
    first_response_at: string | null;
    channel: string; due_at: string | null; resolved_at: string | null; created_at: string;
    company: string | null; contact: string | null; contact_email: string | null;
    assignee: string | null; assignee_avatar: string | null; raiser: string | null;
  }>`
    select t.*, c.name as company, ct.full_name as contact, ct.email as contact_email,
           u.full_name as assignee, u.avatar_url as assignee_avatar, cb.full_name as raiser
      from crm_tickets t
      left join crm_companies c on c.id = t.company_id
      left join crm_contacts ct on ct.id = t.contact_id
      left join users u on u.id = t.assignee_id
      left join users cb on cb.id = t.created_by
     where t.id = ${Number(id)}`;
  if (!t) notFound();

  const replies = await sql<{ id: number; body: string; internal: boolean; created_at: string; author: string | null; author_avatar: string | null }>`
    select r.*, u.full_name as author, u.avatar_url as author_avatar
      from crm_ticket_replies r left join users u on u.id = r.author_id
     where r.ticket_id = ${t.id} order by r.created_at`;

  const overdue = t.due_at && new Date(t.due_at) < new Date() && !["resolved", "closed"].includes(t.status);

  return (
    <>
      <PageHeader title={t.ref} subtitle={`${t.company ?? "no client"}${t.contact ? ` · ${t.contact}` : ""} · via ${titleCase(t.channel)} · raised ${timeAgo(t.created_at)}`}>
        <Badge value={t.priority} />
        <Badge value={t.status} />
        {overdue && <Badge value="overdue" label="Past target" />}
      </PageHeader>

      <Card className="mb-5">
        {/* Not CardTitle: that styles its children uppercase, which mangled a
            client's own words into "TRANSFORMER TRIPPING UNDER LOAD AT OBAJANA". */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-bold">{t.subject}</h2>
          {t.assignee && (
            <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-soft">
              <Avatar name={t.assignee} src={t.assignee_avatar} size="sm" /> {t.assignee}
            </span>
          )}
        </div>
        {t.body && <p className="text-sm font-medium whitespace-pre-wrap">{t.body}</p>}
        <p className="mt-4 border-t border-line pt-3 text-xs font-semibold text-ink-soft">
          {t.first_response_at
            ? `Answered ${fmtDateTime(t.first_response_at)}`
            : `Response target ${t.due_at ? fmtDateTime(t.due_at) : "—"}`}
          {t.resolved_at ? ` · resolved ${fmtDateTime(t.resolved_at)}` : ""}
          {t.raiser ? ` · raised by ${t.raiser}` : ""}
        </p>
      </Card>

      {replies.length > 0 && (
        <ul className="mb-5 space-y-3">
          {replies.map((r) => (
            <li key={r.id}>
              <Card className={r.internal ? "border-amber-200 bg-amber-50/40" : ""}>
                <div className="flex items-start gap-3">
                  <Avatar name={r.author ?? "?"} src={r.author_avatar} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      {r.author ?? "Unknown"}
                      {r.internal && <Badge value="draft" label="Internal note" />}
                      <span className="font-semibold text-ink-soft">{timeAgo(r.created_at)}</span>
                    </p>
                    <p className="mt-1.5 text-sm font-medium whitespace-pre-wrap">{r.body}</p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardTitle>Reply</CardTitle>
        <ActionForm action={replyToTicket} className="space-y-3" reset>
          <input type="hidden" name="ticket_id" value={t.id} />
          <Field label="Message">
            <textarea name="body" rows={5} required className="field resize-y" placeholder="What you did, or what you need from the client." />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="internal" className="h-4 w-4 rounded" /> Internal note — not for the client
            </label>
            <Select name="status" defaultValue={t.status} className="field w-48">
              {["open", "in_progress", "waiting_customer", "resolved", "closed"].map((s) => (
                <option key={s} value={s}>Set status: {s.replace("_", " ")}</option>
              ))}
            </Select>
            <SubmitBtn className="ml-auto">Post reply</SubmitBtn>
          </div>
        </ActionForm>
      </Card>

      <Link href="/tickets" className="mt-5 block text-xs font-bold text-brand-700 hover:underline">← All tickets</Link>
    </>
  );
}
