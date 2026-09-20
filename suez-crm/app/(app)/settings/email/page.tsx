import { requireCap } from "@/lib/auth";
import { getEmailSettings } from "@/lib/settings";
import { saveEmailSettings, sendTestEmail, testEmailConnection } from "@/lib/actions/settings";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Badge, Card, CardTitle, Field, PageHeader, Row } from "@/components/ui";

export const metadata = { title: "Email & notifications" };

const PRESETS = [
  ["Gmail / Google Workspace", "smtp.gmail.com", 587, "App password required"],
  ["Microsoft 365", "smtp.office365.com", 587, "STARTTLS"],
  ["Zoho Mail", "smtp.zoho.com", 465, "SSL"],
  ["Amazon SES", "email-smtp.eu-west-1.amazonaws.com", 587, "SMTP credentials"],
];

export default async function EmailSettingsPage() {
  const me = await requireCap("channels.manage");
  const cfg = await getEmailSettings();
  const live = cfg.enabled && !!cfg.host;

  return (
    <>
      <PageHeader
        title="Email & notifications"
        subtitle="One mail server, used for campaigns and for the notifications the CRM sends your team."
      >
        <Badge value={live ? "active" : "draft"} label={live ? "Sending" : "Disabled"} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Outgoing mail (SMTP)</CardTitle>

          <ActionForm action={saveEmailSettings} className="space-y-4">
            <Row>
              <Field label="SMTP host">
                <input name="host" defaultValue={cfg.host} className="field" placeholder="smtp.office365.com" />
              </Field>
              <Field label="Port">
                <input name="port" type="number" defaultValue={cfg.port} className="field tabular" />
              </Field>
            </Row>
            <Row>
              <Field label="Username">
                <input name="user" defaultValue={cfg.user} className="field" autoComplete="off" />
              </Field>
              <Field label="Password" hint={cfg.pass ? "Stored and sealed. Leave blank to keep it." : "App password or SMTP key."}>
                <input name="pass" type="password" className="field" autoComplete="new-password" placeholder={cfg.pass ? "••••••••" : ""} />
              </Field>
            </Row>
            <Row>
              <Field label="From name">
                <input name="from_name" defaultValue={cfg.from_name} className="field" />
              </Field>
              <Field label="From address">
                <input name="from_email" type="email" defaultValue={cfg.from_email} className="field" placeholder="crm@company.com" />
              </Field>
            </Row>

            <div className="space-y-2 rounded-2xl bg-canvas p-4">
              {[
                ["secure", "Use implicit TLS (port 465)", cfg.secure],
                ["enabled", "Send email from the CRM", cfg.enabled],
              ].map(([name, label, checked]) => (
                <label key={name as string} className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" name={name as string} defaultChecked={checked as boolean} className="h-4 w-4 accent-brand-600" />
                  <span className="text-sm font-semibold">{label}</span>
                </label>
              ))}
            </div>

            {/*
              One switch per kind of event. Everything that emails also lands in
              the recipient's Inbox, so switching one off never loses the record.
            */}
            <div className="rounded-2xl bg-canvas p-4">
              <p className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                Which events email your team
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["notify_on_deposit", "Client deposits", "Funding received, and an account running low or exhausted.", cfg.notify_on_deposit],
                  ["notify_on_assignment", "Assignments", "A record moved to you, or taken off you.", cfg.notify_on_assignment],
                  ["notify_on_lead", "Leads", "A new lead landing on your desk.", cfg.notify_on_lead],
                  ["notify_on_quote", "Quotes", "Accepted, declined, or sent for you to chase.", cfg.notify_on_quote],
                  ["notify_on_ticket", "Support tickets", "Raised, replied to and resolved.", cfg.notify_on_ticket],
                  ["notify_on_deal", "Pipeline", "Stage changes on opportunities you own. Noisy — off by default.", cfg.notify_on_deal],
                  ["notify_on_security", "Sign-ins and passwords", "A new sign-in on your account, or a password change.", cfg.notify_on_security],
                  ["notify_on_general", "Everything else", "Anything without a category of its own.", cfg.notify_on_general],
                ].map(([name, label, hint, checked]) => (
                  <label key={name as string} className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface p-2.5">
                    <input
                      type="checkbox"
                      name={name as string}
                      defaultChecked={checked as boolean}
                      className="mt-0.5 h-4 w-4 accent-brand-600"
                    />
                    <span>
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="block text-[11px] font-medium text-ink-soft">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <SubmitBtn>Save settings</SubmitBtn>
          </ActionForm>

          <div className="mt-6 space-y-4 border-t border-line pt-5">
            <CardTitle>Check it works</CardTitle>
            <ActionForm action={testEmailConnection}>
              <SubmitBtn variant="outline">Test the connection</SubmitBtn>
            </ActionForm>
            <ActionForm action={sendTestEmail} className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Field label="Send a real message to">
                  <input name="to" type="email" defaultValue={me.email} className="field" />
                </Field>
              </div>
              <SubmitBtn variant="outline">Send test</SubmitBtn>
            </ActionForm>
            <p className="text-xs font-medium text-ink-soft">Both use the saved settings. Save your changes first.</p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle>Common providers</CardTitle>
            <ul className="space-y-3">
              {PRESETS.map(([name, host, port, note]) => (
                <li key={name as string} className="rounded-xl bg-canvas p-3">
                  <p className="text-sm font-bold">{name}</p>
                  <p className="text-xs font-semibold text-ink-soft">{host} · port {port}</p>
                  <p className="text-[11px] font-medium text-ink-soft">{note}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>How it behaves</CardTitle>
            <p className="text-sm font-medium text-ink-soft">
              A notification always reaches the Inbox. Email is best-effort on top: if the mail server is unreachable the
              drawdown, the assignment or the ticket is still recorded, and nothing is rolled back.
            </p>
            <p className="mt-3 text-sm font-medium text-ink-soft">
              Set <code className="rounded bg-canvas px-1 py-0.5 text-xs font-bold">APP_URL</code> in the environment so the
              links inside those emails point back at this deployment.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
