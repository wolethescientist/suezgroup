import nodemailer from "nodemailer";
import { getEmailSettings, getOrg, type EmailSettings } from "./settings";
import { open } from "./secretbox";

/**
 * Outgoing mail.
 *
 * ponytail: this lived inside lib/communications.ts, beside the inbound
 * webhook machinery for WhatsApp, SMS and social. That module has gone; the
 * transport has not, because campaigns send through it and so, now, do
 * notifications.
 *
 * The password is sealed in the settings row and opened here — never read
 * straight out of the database into a transport.
 */

export async function crmEmailTransport(settings?: EmailSettings) {
  const cfg = settings ?? (await getEmailSettings());
  if (!cfg.enabled || !cfg.host || !cfg.from_email) throw new Error("CRM outbound email is not configured.");
  const password = open(cfg.pass);
  if (!password) throw new Error("The CRM email password must be saved again.");
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port),
    secure: !!cfg.secure,
    auth: { user: cfg.user, pass: password },
  });
}

/** A plain-text message to a customer. Throws, so campaigns can report failures. */
export async function sendCrmEmail(to: string, subject: string, body: string) {
  const settings = await getEmailSettings();
  const transport = await crmEmailTransport(settings);
  await transport.sendMail({
    from: `"${settings.from_name}" <${settings.from_email}>`,
    to,
    subject,
    text: body,
  });
}

/** Wraps notification copy in a plain, client-safe HTML shell. */
export async function emailShell(heading: string, body: string, cta?: { label: string; href: string }) {
  const org = await getOrg();
  return `<div style="font-family:'Quicksand',Segoe UI,Helvetica,Arial,sans-serif;background:#f6f7fb;padding:28px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e9f2;border-radius:18px;overflow:hidden">
    <div style="background:#b4590b;color:#fff;padding:18px 24px;font-weight:700;font-size:15px">${org.name} · SuezCRM</div>
    <div style="padding:24px;color:#191a2c;font-size:14px;line-height:1.6">
      <h1 style="margin:0 0 12px;font-size:18px">${heading}</h1>
      ${body}
      ${
        cta
          ? `<p style="margin:24px 0 0"><a href="${cta.href}" style="background:#f3862a;color:#191a2c;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;display:inline-block">${cta.label}</a></p>`
          : ""
      }
    </div>
    <div style="padding:16px 24px;color:#6a6b86;font-size:11px;border-top:1px solid #e8e9f2">
      Automated message from the ${org.name} CRM. Please do not reply.
    </div>
  </div>
</div>`;
}

/**
 * Best-effort notification mail.
 *
 * Unlike sendCrmEmail this never throws: a mail server that is down must not
 * roll back the drawdown or the reassignment it was announcing.
 */
export async function sendNotificationEmail(to: string, subject: string, html: string) {
  try {
    const settings = await getEmailSettings();
    const transport = await crmEmailTransport(settings);
    await transport.sendMail({
      from: `"${settings.from_name}" <${settings.from_email}>`,
      to,
      subject,
      html,
    });
    return { sent: true };
  } catch (e) {
    console.error("notification email failed", e);
    return { sent: false, reason: (e as Error).message };
  }
}
