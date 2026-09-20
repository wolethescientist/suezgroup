import { requireCap } from "@/lib/auth";
import { getEmailSettings } from "@/lib/settings";
import { saveEmailSettings, testEmail } from "@/lib/actions/admin";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Badge, Card, CardTitle, Field, Row } from "@/components/ui";

const PRESETS = [
  ["Gmail / Google Workspace", "smtp.gmail.com", 587, "App password required"],
  ["Microsoft 365", "smtp.office365.com", 587, "STARTTLS"],
  ["Zoho Mail", "smtp.zoho.com", 465, "SSL"],
  ["Amazon SES", "email-smtp.eu-west-1.amazonaws.com", 587, "SMTP credentials"],
  ["Mailgun", "smtp.mailgun.org", 587, "Domain SMTP login"],
];

export default async function EmailSettings() {
  const me = await requireCap("settings.email");
  const cfg = await getEmailSettings();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle
          action={<Badge value={cfg.enabled && cfg.host ? "active" : "draft"} label={cfg.enabled && cfg.host ? "Sending" : "Disabled"} />}
        >
          Outgoing mail (SMTP)
        </CardTitle>

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
            <Field label="Password" hint={cfg.pass ? "Stored. Leave blank to keep it." : "App password or SMTP key."}>
              <input name="pass" type="password" className="field" autoComplete="new-password" placeholder={cfg.pass ? "••••••••" : ""} />
            </Field>
          </Row>
          <Row>
            <Field label="From name">
              <input name="from_name" defaultValue={cfg.from_name} className="field" />
            </Field>
            <Field label="From address">
              <input name="from_email" type="email" defaultValue={cfg.from_email} className="field" placeholder="no-reply@company.com" />
            </Field>
          </Row>

          <div className="space-y-2 rounded-2xl bg-canvas p-4">
            {[
              ["secure", "Use implicit TLS (port 465)", cfg.secure],
              ["enabled", "Send notification emails from the portal", cfg.enabled],
            ].map(([name, label, checked]) => (
              <label key={name as string} className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" name={name as string} defaultChecked={checked as boolean} className="h-4 w-4 accent-brand-600" />
                <span className="text-sm font-semibold">{label}</span>
              </label>
            ))}
          </div>

          {/*
            One switch per kind of event.

            ponytail: there were three, because only memos, leave and requests
            ever sent an email — everything else notified inside the portal and
            nowhere else. Every notification now carries a kind, and this is the
            list of them.
          */}
          <div className="rounded-2xl bg-canvas p-4">
            <p className="mb-3 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
              Which events send an email
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["notify_on_memo", "Memos and circulars", "Published, revised, or waiting on a signature.", cfg.notify_on_memo],
                ["notify_on_document", "Documents for approval", "Sent to you to approve and sign, and the outcome coming back.", cfg.notify_on_document],
                ["notify_on_leave", "Leave", "Requests awaiting a decision, and decisions made.", cfg.notify_on_leave],
                ["notify_on_request", "Workflow requests", "Raised, replied to, decided, or landing in a department queue.", cfg.notify_on_request],
                ["notify_on_report", "Weekly and monthly reports", "Submissions, responses, and the reminder to send one.", cfg.notify_on_report],
                ["notify_on_attendance", "Attendance", "Your own clock-ins, and corrections HR makes. Noisy — off by default.", cfg.notify_on_attendance],
                ["notify_on_message", "Internal messages", "Off by default: people are already in the portal to read them.", cfg.notify_on_message],
                ["notify_on_security", "Sign-ins and passwords", "A new sign-in on your account, or a password change.", cfg.notify_on_security],
                ["notify_on_general", "Everything else", "Announcements, projects, procurement and finance.", cfg.notify_on_general],
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

          <SubmitBtn>Save email settings</SubmitBtn>
        </ActionForm>

        <div className="mt-6 border-t border-line pt-5">
          <CardTitle>Send a test message</CardTitle>
          <ActionForm action={testEmail} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Field label="Recipient">
                <input name="to" type="email" defaultValue={me.email} className="field" />
              </Field>
            </div>
            <SubmitBtn variant="outline">Send test</SubmitBtn>
          </ActionForm>
          <p className="mt-2 text-xs font-medium text-ink-soft">
            The test uses the saved credentials. Save your changes first.
          </p>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardTitle>Common providers</CardTitle>
          <ul className="space-y-3">
            {PRESETS.map(([name, host, port, note]) => (
              <li key={name as string} className="rounded-xl bg-canvas p-3">
                <p className="text-sm font-bold">{name}</p>
                <p className="text-xs font-semibold text-ink-soft">
                  {host} · port {port}
                </p>
                <p className="text-[11px] font-medium text-ink-soft">{note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>How it behaves</CardTitle>
          <p className="text-sm font-medium text-ink-soft">
            If SMTP is unreachable the portal still records the memo, leave decision or request — email is best-effort and
            never blocks an action. In-portal notifications always work, and everything that sends an email also appears
            in the recipient&rsquo;s Inbox.
          </p>
          <p className="mt-3 text-sm font-medium text-ink-soft">
            Set <code className="rounded bg-canvas px-1 py-0.5 text-xs font-bold">APP_URL</code> in the environment so the
            links inside those emails point back at this deployment.
          </p>
        </Card>
      </div>
    </div>
  );
}
