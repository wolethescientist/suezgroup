import nodemailer from "nodemailer";
import { getEmailSettings, getOrg, type EmailSettings } from "./settings";

export function transportFor(cfg: EmailSettings) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

/** Wraps body copy in a plain, client-safe HTML shell. */
export async function emailShell(heading: string, body: string, cta?: { label: string; href: string }) {
  const org = await getOrg();
  return `<div style="font-family:'Quicksand',Segoe UI,Helvetica,Arial,sans-serif;background:#f6f7fb;padding:28px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e9f2;border-radius:18px;overflow:hidden">
    <div style="background:#b4590b;color:#fff;padding:18px 24px;font-weight:700;font-size:15px">${org.name} · SuezERP</div>
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
      Automated message from the ${org.name} staff portal. Please do not reply.
    </div>
  </div>
</div>`;
}

/**
 * Sends mail if SMTP is configured and enabled in Settings → Email.
 * Never throws: a broken mail server must not roll back an approved leave request.
 */
export async function sendMail(to: string | string[], subject: string, html: string) {
  const cfg = await getEmailSettings();
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!cfg.enabled || !cfg.host || !list.length) return { sent: false, reason: "email disabled or not configured" };
  try {
    await transportFor(cfg).sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email || cfg.user}>`,
      to: list.join(", "),
      subject,
      html,
    });
    return { sent: true };
  } catch (e) {
    console.error("sendMail failed", e);
    return { sent: false, reason: (e as Error).message };
  }
}
