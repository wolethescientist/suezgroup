"use server";

import { revalidatePath } from "next/cache";
import { requireCap } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getEmailSettings, setSetting } from "@/lib/settings";
import { seal } from "@/lib/secretbox";
import { crmEmailTransport, emailShell, sendNotificationEmail } from "@/lib/mail";

const str = (fd: FormData, key: string) => (fd.get(key) ?? "").toString().trim();

/**
 * The outgoing mail server, and which events send an email.
 *
 * ponytail: this lived under Communications → Settings, beside the inbound
 * webhook machinery. Communications has gone; the mail server has not, because
 * campaigns and now every internal notification go through it.
 */
export async function saveEmailSettings(fd: FormData) {
  const me = await requireCap("channels.manage");
  const current = await getEmailSettings();

  const port = Number(str(fd, "port")) || 587;
  const secure = fd.get("secure") === "on";
  if (port === 587 && secure)
    return { error: "Port 587 uses STARTTLS. Turn off implicit TLS, or use port 465." };

  const password = str(fd, "pass");
  const next = {
    ...current,
    host: str(fd, "host"),
    port,
    secure,
    user: str(fd, "user"),
    // Blank means "keep what is stored" — the form never echoes the password back.
    pass: password ? seal(password) : current.pass,
    from_name: str(fd, "from_name") || "SuezCRM",
    from_email: str(fd, "from_email"),
    enabled: fd.get("enabled") === "on",
    notify_on_lead: fd.get("notify_on_lead") === "on",
    notify_on_deal: fd.get("notify_on_deal") === "on",
    notify_on_quote: fd.get("notify_on_quote") === "on",
    notify_on_ticket: fd.get("notify_on_ticket") === "on",
    notify_on_deposit: fd.get("notify_on_deposit") === "on",
    notify_on_assignment: fd.get("notify_on_assignment") === "on",
    notify_on_security: fd.get("notify_on_security") === "on",
    notify_on_general: fd.get("notify_on_general") === "on",
  };

  if (next.enabled && (!next.host || !next.user || !next.pass || !next.from_email))
    return { error: "Host, username, password and From address are all required when email is switched on." };

  await setSetting("email", next);
  await audit(me.id, "settings.email.save", "setting", "email", { host: next.host, enabled: next.enabled });
  revalidatePath("/settings/email");
  return { ok: true, message: "Email settings saved." };
}

/** Proves the credentials work, without sending anything to a customer. */
export async function testEmailConnection() {
  await requireCap("channels.manage");
  try {
    const transport = await crmEmailTransport();
    await transport.verify();
    transport.close();
    return { ok: true, message: "SMTP connection and authentication succeeded." };
  } catch (error) {
    return { error: `SMTP test failed: ${(error as Error).message}` };
  }
}

/** Sends a real message, which is the only way to know delivery works end to end. */
export async function sendTestEmail(fd: FormData) {
  const me = await requireCap("channels.manage");
  const to = str(fd, "to") || me.email;
  const sent = await sendNotificationEmail(
    to,
    "SuezCRM test message",
    await emailShell(
      "Your CRM email settings work",
      `<p>This test was sent by ${me.full_name} from Administration → Email &amp; Notifications.</p>`,
    ),
  );
  if (!sent.sent) return { error: `The message was not sent: ${sent.reason}` };
  await audit(me.id, "settings.email.test", "setting", "email", { to });
  return { ok: true, message: `Test message sent to ${to}.` };
}
