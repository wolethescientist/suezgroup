import { requireUser } from "@/lib/auth";
import { accountFor, foldersFor } from "@/lib/mailbox";
import { mailFolderLabel } from "@/lib/mail-folders";
import { Card, CardTitle, Field, Row } from "@/components/ui";
import { ActionForm, SubmitBtn } from "@/components/form";
import { deleteMailAccount, saveMailAccount, testMailAccount } from "@/lib/actions/mail";

export const metadata = { title: "Mailbox" };

/** Common providers, so most people never have to look a host up. */
const PRESETS = [
  ["Microsoft 365 / Outlook", "outlook.office365.com", 993, "smtp.office365.com", 587],
  ["Gmail / Google Workspace", "imap.gmail.com", 993, "smtp.gmail.com", 587],
  ["Zoho Mail — paid organisation", "imappro.zoho.com", 993, "smtppro.zoho.com", 465],
  ["Zoho Mail — personal / free", "imap.zoho.com", 993, "smtp.zoho.com", 465],
  ["cPanel / shared hosting", "mail.yourdomain.com", 993, "mail.yourdomain.com", 465],
] as const;

export default async function MailboxSettingsPage() {
  const me = await requireUser();
  const account = await accountFor(me.id);
  const folders = account ? await foldersFor(account.id) : [];

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle
          action={account && <span className="text-xs font-semibold text-ink-soft">
            {account.last_sync_at ? "Connected" : "Not yet synced"}
          </span>}
        >
          Your mailbox
        </CardTitle>
        <p className="mb-4 text-sm font-medium text-ink-soft">
          Connect your work email and read, reply and send without leaving the portal. Your password is encrypted
          before it is stored and is only ever sent to your own mail server.
        </p>

        <ActionForm action={saveMailAccount} className="space-y-4">
          <Row>
            <Field label="Display name"><input name="display_name" defaultValue={account?.display_name ?? me.full_name} className="field" /></Field>
            <Field label="Email address"><input name="email" type="email" required defaultValue={account?.email ?? me.email} className="field" /></Field>
          </Row>

          <div className="rounded-2xl bg-canvas p-4">
            <p className="mb-3 text-xs font-bold tracking-wider text-ink-soft uppercase">Incoming — IMAP</p>
            <Row>
              <Field label="Host"><input name="imap_host" required defaultValue={account?.imap_host ?? ""} className="field" placeholder="outlook.office365.com" /></Field>
              <Field label="Port"><input name="imap_port" type="number" defaultValue={account?.imap_port ?? 993} className="field" /></Field>
            </Row>
            <Row className="mt-3">
              <Field label="Username"><input name="imap_user" defaultValue={account?.imap_user ?? ""} className="field" placeholder="Usually your email address" /></Field>
              <Field label="Password" hint={account ? "Leave blank to keep the saved one." : undefined}>
                <input name="imap_pass" type="password" autoComplete="new-password" className="field" placeholder={account ? "••••••••" : ""} />
              </Field>
            </Row>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="imap_secure" defaultChecked={account?.imap_secure ?? true} className="h-4 w-4 rounded" />
              Use TLS (port 993)
            </label>
          </div>

          <div className="rounded-2xl bg-canvas p-4">
            <p className="mb-3 text-xs font-bold tracking-wider text-ink-soft uppercase">Outgoing — SMTP</p>
            <Row>
              <Field label="Host"><input name="smtp_host" required defaultValue={account?.smtp_host ?? ""} className="field" placeholder="smtp.office365.com" /></Field>
              <Field label="Port"><input name="smtp_port" type="number" defaultValue={account?.smtp_port ?? 587} className="field" /></Field>
            </Row>
            <Row className="mt-3">
              <Field label="Username" hint="Leave blank to reuse the IMAP username."><input name="smtp_user" defaultValue={account?.smtp_user ?? ""} className="field" /></Field>
              <Field label="Password" hint="Leave blank to reuse the IMAP password."><input name="smtp_pass" type="password" autoComplete="new-password" className="field" /></Field>
            </Row>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="smtp_secure" defaultChecked={account?.smtp_secure ?? false} className="h-4 w-4 rounded" />
              Implicit TLS (port 465). Leave off for STARTTLS on 587.
            </label>
          </div>

          <Field label="Signature" hint="Appended to messages you send from here.">
            <textarea name="signature" rows={3} defaultValue={account?.signature ?? ""} className="field resize-y" />
          </Field>

          <div className="flex flex-wrap gap-2">
            <SubmitBtn>{account ? "Save mailbox" : "Connect mailbox"}</SubmitBtn>
          </div>
        </ActionForm>
      </Card>

      {account && (
        <Card>
          <CardTitle>Connection</CardTitle>
          {account.last_error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset">
              Last error: {account.last_error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionForm action={testMailAccount}><SubmitBtn variant="soft">Test &amp; refresh folders</SubmitBtn></ActionForm>
            <ActionForm action={deleteMailAccount}><SubmitBtn variant="ghost">Disconnect mailbox</SubmitBtn></ActionForm>
          </div>
          {folders.length > 0 && (
            <div className="mt-4 rounded-2xl bg-canvas p-4">
              <p className="mb-2 text-xs font-bold tracking-wider text-ink-soft uppercase">
                IMAP folders ({folders.filter((folder) => folder.selectable).length} selectable)
              </p>
              <ul className="flex flex-wrap gap-2">
                {folders.map((folder) => (
                  <li key={folder.path} title={folder.path}
                      className={`rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line ${folder.selectable ? "text-ink" : "text-ink-soft opacity-60"}`}>
                    {mailFolderLabel(folder)}{folder.path !== mailFolderLabel(folder) ? ` · ${folder.path}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>Common settings</CardTitle>
        <ul className="divide-y divide-line text-sm">
          {PRESETS.map(([name, ih, ip, sh, sp]) => (
            <li key={name} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span className="font-bold">{name}</span>
              <span className="font-mono text-xs text-ink-soft">IMAP {ih}:{ip} · SMTP {sh}:{sp}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-medium text-ink-soft">
          If your organisation enforces multi-factor authentication, generate an app password in your mail account
          and use that here rather than your normal password. Zoho users must also enable IMAP access in Zoho Mail;
          use the exact server shown in Zoho&apos;s Server Configuration Details for your account.
        </p>
      </Card>
    </div>
  );
}
