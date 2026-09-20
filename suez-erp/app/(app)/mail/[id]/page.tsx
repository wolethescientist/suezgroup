import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { accountFor } from "@/lib/mailbox";
import { fmtDateTime } from "@/lib/format";
import { Avatar, Card, CardTitle, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { markRead, sendMailMessage, toggleFlag } from "@/lib/actions/mail";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const account = await accountFor(me.id);
  if (!account) notFound();

  const [m] = await sql<{
    id: number; folder: string; message_id: string | null; from_name: string | null; from_email: string | null;
    to_emails: string | null; cc_emails: string | null; subject: string | null; body_text: string | null;
    body_html: string | null; seen: boolean; flagged: boolean; sent_at: string | null;
  }>`select * from mail_messages where id = ${Number(id)} and account_id = ${account.id}`;
  if (!m) notFound();

  // Opening a message marks it read, here rather than in an effect so it also
  // works without JavaScript and survives a refresh.
  if (!m.seen) {
    await sql`update mail_messages set seen = true where id = ${m.id}`;
  }

  const attachments = await sql<{ id: number; filename: string; mime: string; size_bytes: number }>`
    select id, filename, mime, size_bytes from mail_attachments where message_id = ${m.id}`;

  const quoted = (m.body_text ?? "").split("\n").map((l) => `> ${l}`).join("\n");

  return (
    <>
      <PageHeader title={m.subject || "(no subject)"} subtitle={`${m.from_name ?? ""} <${m.from_email ?? "unknown"}> · ${fmtDateTime(m.sent_at)}`}>
        <ActionForm action={toggleFlag}>
          <input type="hidden" name="id" value={m.id} />
          <SubmitBtn variant="ghost">{m.flagged ? "Unflag" : "Flag"}</SubmitBtn>
        </ActionForm>
        <ActionForm action={markRead}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="seen" value="false" />
          <SubmitBtn variant="ghost">Mark unread</SubmitBtn>
        </ActionForm>
      </PageHeader>

      <Card>
        <div className="mb-4 flex items-start gap-3 border-b border-line pb-4">
          <Avatar name={m.from_name || m.from_email || "?"} size="lg" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">{m.from_name || m.from_email}</p>
            <p className="font-medium text-ink-soft">To: {m.to_emails ?? "—"}</p>
            {m.cc_emails && <p className="font-medium text-ink-soft">Cc: {m.cc_emails}</p>}
          </div>
        </div>

        {/*
          Remote HTML is not injected into the page — an email body is attacker-controlled,
          and dangerouslySetInnerHTML here would be stored XSS from anyone who can email a
          member of staff. The plain-text part is shown instead.
        */}
        <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{m.body_text || "(no plain-text content)"}</pre>

        {m.body_html && !m.body_text && (
          <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs font-semibold text-ink-soft">
            This message was sent as HTML only. It is shown as text for safety.
          </p>
        )}

        {attachments.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {attachments.map((a) => (
              <li key={a.id} className="rounded-xl bg-canvas px-3 py-2 text-xs font-bold">
                📎 {a.filename} <span className="font-medium text-ink-soft">({Math.round(a.size_bytes / 1024)} KB)</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5">
        <CardTitle>Reply</CardTitle>
        <ActionForm action={sendMailMessage} className="space-y-3">
          <input type="hidden" name="to" value={m.from_email ?? ""} />
          <input type="hidden" name="in_reply_to" value={m.message_id ?? ""} />
          <input type="hidden" name="subject" value={m.subject?.startsWith("Re:") ? m.subject : `Re: ${m.subject ?? ""}`} />
          <Field label={`To ${m.from_email ?? ""}`}>
            <textarea name="body" rows={7} required className="field resize-y" defaultValue={`\n\n${quoted}`} />
          </Field>
          <SubmitBtn>Send reply</SubmitBtn>
        </ActionForm>
      </Card>

      <Link href={`/mail?folder=${encodeURIComponent(m.folder)}`} className="mt-5 block text-xs font-bold text-brand-700 hover:underline">
        ← Back to {m.folder}
      </Link>
    </>
  );
}
