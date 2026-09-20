import { sql } from "./db";

export type OrgSettings = {
  name: string;
  short_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  timezone: string;
  currency: string;
  fiscal_year_start: string;
  logo?: string | null;
};

export type EmailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from_name: string;
  from_email: string;
  enabled: boolean;
  /**
   * One switch per kind of event, matching NotifyKind in lib/notify. A switch
   * absent from the stored row reads as its default here, so adding an event
   * does not need a migration.
   *
   * ponytail: these were notify_on_memo/leave/request — the ERP's events,
   * inherited wholesale into a CRM that has no memos, no leave and no
   * workflow requests, and checked by nothing.
   */
  notify_on_lead: boolean;
  notify_on_deal: boolean;
  notify_on_quote: boolean;
  notify_on_ticket: boolean;
  notify_on_deposit: boolean;
  notify_on_assignment: boolean;
  notify_on_security: boolean;
  notify_on_general: boolean;
};

export const ORG_DEFAULTS: OrgSettings = {
  name: "Suez Group",
  short_name: "Suez",
  address: "",
  phone: "",
  email: "",
  website: "",
  timezone: "Africa/Lagos",
  currency: "NGN",
  fiscal_year_start: "01-01",
  logo: null,
};

export const EMAIL_DEFAULTS: EmailSettings = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  from_name: "SuezCRM",
  from_email: "",
  enabled: false,
  notify_on_lead: true,
  notify_on_deal: false,
  notify_on_quote: true,
  notify_on_ticket: true,
  notify_on_deposit: true,
  notify_on_assignment: true,
  notify_on_security: true,
  notify_on_general: true,
};

export type SigningSettings = {
  /** Require the signer to re-enter their account password when acknowledging. */
  require_password: boolean;
};

export const SIGNING_DEFAULTS: SigningSettings = { require_password: true };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await sql<{ value: T }>`select value from settings where key = ${key}`;
  return { ...fallback, ...(rows[0]?.value ?? {}) };
}

export async function setSetting(key: string, value: unknown) {
  await sql`
    insert into settings (key, value) values (${key}, ${JSON.stringify(value)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export const getOrg = () => getSetting("organisation", ORG_DEFAULTS);
export const getEmailSettings = () => getSetting("email", EMAIL_DEFAULTS);
export const getSigningSettings = () => getSetting("signing", SIGNING_DEFAULTS);
