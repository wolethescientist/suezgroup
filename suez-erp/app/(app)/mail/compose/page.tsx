import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { accountFor } from "@/lib/mailbox";
import { Card, Field, PageHeader, Row } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { sendMailMessage } from "@/lib/actions/mail";

export const metadata = { title: "Compose" };

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ to?: string; subject?: string }> }) {
  const me = await requireUser();
  const account = await accountFor(me.id);
  if (!account) redirect("/settings/mailbox");
  const { to = "", subject = "" } = await searchParams;

  return (
    <>
      <PageHeader title="New message" subtitle={`Sending as ${account.display_name ?? account.email} <${account.email}>`} />
      <Card>
        <ActionForm action={sendMailMessage} className="space-y-4">
          <Field label="To" hint="Separate several addresses with commas.">
            <input name="to" required defaultValue={to} className="field" placeholder="someone@client.com" />
          </Field>
          <Row>
            <Field label="Cc"><input name="cc" className="field" /></Field>
            <Field label="Bcc"><input name="bcc" className="field" /></Field>
          </Row>
          <Field label="Subject"><input name="subject" defaultValue={subject} className="field" /></Field>
          <Field label="Message" hint={account.signature ? "Your signature is appended automatically." : undefined}>
            <textarea name="body" rows={14} required className="field resize-y" />
          </Field>
          <div className="flex gap-2">
            <SubmitBtn>Send</SubmitBtn>
          </div>
        </ActionForm>
      </Card>
      <Link href="/mail" className="mt-5 block text-xs font-bold text-brand-700 hover:underline">← Back to mail</Link>
    </>
  );
}
