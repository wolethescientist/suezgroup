type ProtocolError = {
  message?: string;
  code?: string;
  response?: string;
  serverResponseCode?: string;
};

/** Converts terse protocol-library failures into safe, actionable UI text. */
export function readableImapError(error: unknown, host = ""): string {
  const value = error && typeof error === "object" ? (error as ProtocolError) : {};
  const response = value.response || "";
  const code = value.serverResponseCode || value.code || "";
  const combined = `${code} ${response} ${value.message || ""}`;

  if (/AUTHENTICATIONFAILED|AUTHORIZATIONFAILED|Invalid credentials/i.test(combined)) {
    if (/zoho/i.test(host)) {
      const endpoint = /(^|\.)imap\.zoho\./i.test(host)
        ? " For a paid custom-domain Zoho mailbox, use imappro.zoho.com for IMAP and smtppro.zoho.com for SMTP."
        : "";
      return `Zoho rejected the IMAP username or password (AUTHENTICATIONFAILED).${endpoint} Enable IMAP access in Zoho Mail and, if MFA or SAML is enabled, use a Zoho app-specific password instead of the normal account password.`;
    }
    return "The IMAP server rejected the username or password (AUTHENTICATIONFAILED). Check the full username, enable IMAP access, and use an app-specific password when MFA is enabled.";
  }

  if (/ENOTFOUND|getaddrinfo/i.test(combined)) return `The IMAP server name could not be found${host ? ` (${host})` : ""}.`;
  if (/ECONNREFUSED/i.test(combined)) return `The IMAP server refused the connection${host ? ` (${host})` : ""}. Check the host, port and TLS setting.`;
  if (/ETIMEDOUT|timeout/i.test(combined)) return `The IMAP connection timed out${host ? ` (${host})` : ""}. Check the host, port and firewall.`;
  if (/certificate|self signed|CERT_/i.test(combined)) return "The IMAP server's TLS certificate could not be verified.";

  // ImapFlow's Error.message is sometimes only "Command failed" while its
  // response contains the useful server text. Remove the command tag/status
  // and cap it so an unusual server response cannot flood the settings page.
  const detail = response.replace(/^\S+\s+(?:NO|BAD)\s+/i, "").trim();
  if (detail) return `IMAP server response: ${detail.slice(0, 300)}`;
  return value.message || "The IMAP command failed.";
}

export function readableSmtpError(error: unknown): string {
  const value = error && typeof error === "object" ? (error as ProtocolError) : {};
  const combined = `${value.code || ""} ${value.response || ""} ${value.message || ""}`;
  if (/wrong version number|tls_validate_record_header/i.test(combined)) {
    return "The SMTP port and TLS mode do not match. Use port 465 with Implicit TLS enabled, or port 587 with Implicit TLS disabled (STARTTLS).";
  }
  if (/AUTHENTICATIONFAILED|Invalid login|EAUTH|535/i.test(combined)) {
    return "The SMTP server rejected the username or password. Use the same app-specific password configured for IMAP.";
  }
  return value.response || value.message || "The SMTP command failed.";
}
