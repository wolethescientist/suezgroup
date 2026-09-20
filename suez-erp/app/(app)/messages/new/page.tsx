import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { startConversation } from "@/lib/actions/messages";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Card, Field, PageHeader, Row } from "@/components/ui";

export const metadata = { title: "New message" };

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const me = await requireUser();
  const { to } = await searchParams;
  const people = await sql<{ id: number; full_name: string; job_title: string | null; department: string | null }>`
    select u.id, u.full_name, u.job_title, d.name as department
      from users u left join departments d on d.id = u.department_id
     where u.status = 'active' and u.id <> ${me.id} order by u.full_name`;
  const selected = Number(to) || 0;
  return <div className="p-5 sm:p-7">
    <PageHeader title="New message" subtitle="Choose a colleague, write the first message, and the conversation opens straight away.">
      <Link href="/messages" className="rounded-xl px-3 py-2 text-xs font-bold text-ink-soft hover:bg-canvas hover:text-ink">← Conversations</Link>
    </PageHeader>
    <Card className="max-w-2xl"><ActionForm action={startConversation} className="space-y-5">
      <Field label="Recipient"><select name="members" required className="field" defaultValue={selected || ""}><option value="" disabled>Choose a colleague</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.job_title ? ` — ${p.job_title}` : ""}{p.department ? ` · ${p.department}` : ""}</option>)}</select></Field>
      <Row><Field label="Subject" hint="Optional for a direct message."><input name="subject" className="field" placeholder="e.g. Client meeting follow-up" /></Field><Field label="Conversation type"><input value="Direct message" disabled className="field" /></Field></Row>
      <Field label="Message"><textarea name="body" required rows={7} className="field resize-y" placeholder="Write your message…" /></Field>
      <SubmitBtn>Start conversation</SubmitBtn>
    </ActionForm></Card>
  </div>;
}
