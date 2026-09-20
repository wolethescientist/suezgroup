import { canAny, getUser, type SessionUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { csvResponse } from "@/lib/csv";

class Forbidden extends Error {}

type Dataset = {
  /**
   * Capabilities, any one of which is enough. Omit to allow any signed-in user.
   *
   * ponytail: this was a list of role NAMES checked with roles.includes(me.role).
   * Once roles became data that quietly broke — a custom role granted audit.view
   * could open the Audit trail and then got a 403 from the Export CSV button on
   * that very page.
   */
  caps?: string[];
  columns: { key: string; label: string }[];
  rows: (me: SessionUser, q: URLSearchParams) => Promise<Record<string, unknown>[]>;
};

const col = (key: string, label: string) => ({ key, label });

// ponytail: one registry and one route rather than a file per download button.
const DATASETS: Record<string, Dataset> = {
  // ponytail: an `employees` dataset used to live here, dumping the whole staff
  // directory — work email, phone, department, access level, signature on file
  // and last sign-in — out of the CRM. That is HR data and belongs to the ERP,
  // which has its own export behind its own Administration screens. Removed.

  "crm-companies": {
    columns: [
      col("name", "Company"),
      col("industry", "Industry"),
      col("status", "Relationship"),
      col("email", "Email"),
      col("phone", "Phone"),
      col("website", "Website"),
      col("address", "Address"),
      col("size", "Headcount"),
      col("owner", "Account owner"),
      col("contacts", "Contacts"),
      col("open_deals", "Open deals"),
      col("open_value", "Open pipeline"),
      col("won_value", "Closed won"),
      col("created_at", "Added"),
    ],
    async rows() {
      return sql`
        select c.name, c.industry, c.status, c.email, c.phone, c.website, c.address, c.size,
               u.full_name as owner,
               (select count(*) from crm_contacts ct where ct.company_id = c.id)::int as contacts,
               (select count(*) from crm_deals d where d.company_id = c.id and d.stage not in ('won','lost'))::int as open_deals,
               (select coalesce(sum(value),0) from crm_deals d where d.company_id = c.id and d.stage not in ('won','lost')) as open_value,
               (select coalesce(sum(value),0) from crm_deals d where d.company_id = c.id and d.stage = 'won') as won_value,
               c.created_at
          from crm_companies c left join users u on u.id = c.owner_id
         order by c.name`;
    },
  },

  "crm-contacts": {
    columns: [
      col("full_name", "Contact"),
      col("job_title", "Job title"),
      col("company", "Company"),
      col("email", "Email"),
      col("phone", "Phone"),
      col("is_primary", "Primary"),
      col("owner", "Owner"),
      col("notes", "Notes"),
      col("created_at", "Added"),
    ],
    async rows() {
      return sql`
        select ct.full_name, ct.job_title, c.name as company, ct.email, ct.phone, ct.is_primary,
               u.full_name as owner, ct.notes, ct.created_at
          from crm_contacts ct
          left join crm_companies c on c.id = ct.company_id
          left join users u on u.id = ct.owner_id
         order by ct.full_name`;
    },
  },

  "crm-deals": {
    columns: [
      col("title", "Opportunity"),
      col("company", "Company"),
      col("contact", "Contact"),
      col("value", "Value"),
      col("currency", "Currency"),
      col("stage", "Stage"),
      col("probability", "Probability %"),
      col("weighted", "Weighted value"),
      col("owner", "Owner"),
      col("expected_close", "Expected close"),
      col("notes", "Notes"),
      col("created_at", "Created"),
      col("updated_at", "Last updated"),
    ],
    async rows() {
      return sql`
        select d.title, c.name as company, ct.full_name as contact, d.value, d.currency, d.stage,
               d.probability, round(d.value * d.probability / 100.0, 2) as weighted,
               u.full_name as owner, d.expected_close, d.notes, d.created_at, d.updated_at
          from crm_deals d
          left join crm_companies c on c.id = d.company_id
          left join crm_contacts ct on ct.id = d.contact_id
          left join users u on u.id = d.owner_id
         order by d.value desc`;
    },
  },

  "crm-activities": {
    columns: [
      col("kind", "Type"),
      col("subject", "Subject"),
      col("owner", "Owner"),
      col("deal", "Opportunity"),
      col("company", "Company"),
      col("contact", "Contact"),
      col("due_at", "Due"),
      col("completed_at", "Completed"),
      col("notes", "Notes"),
    ],
    async rows() {
      return sql`
        select a.kind, a.subject, u.full_name as owner, d.title as deal, c.name as company,
               ct.full_name as contact, a.due_at, a.completed_at, a.notes
          from crm_activities a
          left join users u on u.id = a.owner_id
          left join crm_deals d on d.id = a.deal_id
          left join crm_companies c on c.id = a.company_id
          left join crm_contacts ct on ct.id = a.contact_id
         order by coalesce(a.due_at, a.created_at) desc`;
    },
  },

  "crm-quotes": {
    columns: [
      col("ref", "Reference"),
      col("title", "Title"),
      col("company", "Client"),
      col("status", "Status"),
      col("issue_date", "Issued"),
      col("valid_until", "Valid until"),
      col("subtotal", "Subtotal"),
      col("discount", "Discount"),
      col("tax_amount", "VAT"),
      col("total", "Total"),
      col("owner", "Owner"),
    ],
    async rows() {
      return sql`
        select q.ref, q.title, c.name as company, q.status, q.issue_date, q.valid_until,
               q.subtotal, q.discount, q.tax_amount, q.total, u.full_name as owner
          from crm_quotes q
          left join crm_companies c on c.id = q.company_id
          left join users u on u.id = q.owner_id
         order by q.created_at desc`;
    },
  },

  "crm-tickets": {
    columns: [
      col("ref", "Reference"),
      col("subject", "Subject"),
      col("company", "Client"),
      col("priority", "Priority"),
      col("status", "Status"),
      col("channel", "Channel"),
      col("assignee", "Assigned to"),
      col("created_at", "Raised"),
      col("due_at", "Response target"),
      col("first_response_at", "First response"),
      col("resolved_at", "Resolved"),
    ],
    async rows() {
      return sql`
        select t.ref, t.subject, c.name as company, t.priority, t.status, t.channel,
               u.full_name as assignee, t.created_at, t.due_at, t.first_response_at, t.resolved_at
          from crm_tickets t
          left join crm_companies c on c.id = t.company_id
          left join users u on u.id = t.assignee_id
         order by t.created_at desc`;
    },
  },

  "crm-leads": {
    columns: [
      col("full_name", "Name"),
      col("job_title", "Job title"),
      col("company_name", "Company"),
      col("industry", "Industry"),
      col("email", "Email"),
      col("phone", "Phone"),
      col("source", "Source"),
      col("score", "Score"),
      col("estimated_value", "Estimated value"),
      col("status", "Status"),
      col("owner", "Owner"),
      col("created_at", "Added"),
    ],
    async rows() {
      return sql`
        select l.full_name, l.job_title, l.company_name, l.industry, l.email, l.phone,
               l.source, l.score, l.estimated_value, l.status, u.full_name as owner, l.created_at
          from crm_leads l left join users u on u.id = l.owner_id
         order by l.score desc, l.created_at desc`;
    },
  },

  /**
   * Deposit accounts. No `caps` gate: `listDeposits` already scopes to what
   * this person may see, so a rep exports their own customers' accounts and
   * only a deposit.view holder exports everybody's.
   */
  "crm-deposits": {
    columns: [
      col("ref", "Reference"),
      col("company", "Customer"),
      col("name", "Account"),
      col("currency", "Currency"),
      col("funded", "Funded"),
      col("drawn", "Drawn down"),
      col("balance", "Remaining"),
      col("drawdowns", "Drawdowns"),
      col("status", "Status"),
      col("opened_on", "Opened"),
      col("last_movement_on", "Last movement"),
      col("owner", "Owner"),
    ],
    async rows(me) {
      const { listDeposits } = await import("@/lib/deposits");
      return listDeposits(me, {});
    },
  },

  "crm-deposit-ledger": {
    columns: [
      col("ref", "Entry"),
      col("occurred_on", "Date"),
      col("kind", "Type"),
      col("description", "Description"),
      col("reference", "Their reference"),
      col("money_in", "In"),
      col("money_out", "Out"),
      col("balance_after", "Balance after"),
      col("items", "Items"),
      col("recorded_by_name", "Recorded by"),
      col("created_at", "Recorded at"),
    ],
    async rows(me, q) {
      const depositId = Number(q.get("deposit"));
      if (!depositId) throw new Forbidden("A deposit account is required.");

      const { getDeposit, ledgerFor } = await import("@/lib/deposits");
      const deposit = await getDeposit(me, depositId);
      if (!deposit) throw new Forbidden("That deposit account is not yours.");

      const ledger = await ledgerFor(depositId);
      // Oldest first in the CSV, so the running balance reads downwards the way
      // an accountant expects — the opposite of the screen, which leads on the
      // newest movement.
      const oldestFirst = [...ledger].reverse();
      let running = 0;
      return oldestFirst.map((e) => {
        const amount = Number(e.amount);
        running += amount;
        return {
          ref: e.ref,
          occurred_on: e.occurred_on,
          kind: e.kind,
          description: e.description,
          reference: e.reference ?? "",
          money_in: amount > 0 ? amount.toFixed(2) : "",
          money_out: amount < 0 ? (-amount).toFixed(2) : "",
          balance_after: running.toFixed(2),
          items: e.items.map((i) => `${i.description} x${Number(i.quantity)} @ ${Number(i.unit_price)}`).join(" | "),
          recorded_by_name: e.recorded_by_name ?? "",
          created_at: e.created_at,
        };
      });
    },
  },

  "crm-campaigns": {
    columns: [
      col("name", "Campaign"),
      col("channel", "Channel"),
      col("status", "Status"),
      col("start_date", "Starts"),
      col("end_date", "Ends"),
      col("budget", "Budget"),
      col("audience", "Audience"),
      col("owner", "Owner"),
    ],
    async rows() {
      return sql`
        select c.name, c.channel, c.status, c.start_date, c.end_date, c.budget,
               (select count(*) from crm_campaign_recipients r where r.campaign_id = c.id)::int as audience,
               u.full_name as owner
          from crm_campaigns c left join users u on u.id = c.owner_id
         order by c.created_at desc`;
    },
  },

  "audit-log": {
    caps: ["audit.view"],
    columns: [
      col("created_at", "When"),
      col("actor", "Who"),
      col("email", "Email"),
      col("action", "Action"),
      col("entity", "Entity"),
      col("entity_id", "Entity id"),
      col("meta", "Detail"),
    ],
    async rows() {
      const rows = await sql<Record<string, unknown>>`
        select a.created_at, u.full_name as actor, u.email, a.action, a.entity, a.entity_id, a.meta
          from audit_log a left join users u on u.id = a.user_id
         order by a.created_at desc limit 10000`;
      return rows.map((r) => ({ ...r, meta: r.meta ? JSON.stringify(r.meta) : "" }));
    },
  },
};

export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const me = await getUser();
  if (!me) return new Response("Unauthorised", { status: 401 });

  const { dataset } = await params;
  const spec = DATASETS[dataset];
  if (!spec) return new Response(`Unknown export "${dataset}"`, { status: 404 });
  if (spec.caps && !canAny(me, ...spec.caps)) return new Response("Forbidden", { status: 403 });

  try {
    const rows = await spec.rows(me, new URL(request.url).searchParams);
    return csvResponse(dataset, spec.columns, rows);
  } catch (e) {
    if (e instanceof Forbidden) return new Response(e.message, { status: 403 });
    throw e;
  }
}
