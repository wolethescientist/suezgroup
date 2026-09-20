import type { FieldSpec } from "./spreadsheet";

/**
 * What each importable dataset accepts, and the header names it recognises.
 * Aliases exist because staff spreadsheets say "Coy Name", "Client", "Organisation"
 * and "Account" for the same column — auto-mapping those saves the manual step.
 */
export type Dataset = { key: string; label: string; hint: string; fields: FieldSpec[] };

const owner: FieldSpec = { key: "owner", label: "Owner (email)", aliases: ["account manager", "rep", "assigned to", "sales rep"] };

export const DATASETS: Dataset[] = [
  {
    key: "crm-companies",
    label: "Companies",
    hint: "Client accounts. Matched on name — an existing company is updated, not duplicated.",
    fields: [
      { key: "name", label: "Company name", required: true, aliases: ["company", "account", "organisation", "organization", "client", "coy name", "customer"] },
      { key: "industry", label: "Industry", aliases: ["sector", "vertical"] },
      { key: "website", label: "Website", aliases: ["url", "site", "web"] },
      { key: "email", label: "Email", aliases: ["e-mail", "company email"] },
      { key: "phone", label: "Phone", aliases: ["telephone", "tel", "mobile", "gsm", "contact number"] },
      { key: "address", label: "Address", aliases: ["location", "office"] },
      { key: "size", label: "Size", aliases: ["headcount", "employees", "staff strength"] },
      { key: "status", label: "Relationship", aliases: ["stage", "type", "category", "relationship"] },
      { key: "notes", label: "Notes", aliases: ["comment", "remarks", "description"] },
      owner,
    ],
  },
  {
    key: "crm-contacts",
    label: "Contacts",
    hint: "People at client companies. A company named in the row is created if missing.",
    fields: [
      { key: "full_name", label: "Full name", required: true, aliases: ["name", "contact", "contact name", "person"] },
      { key: "company", label: "Company", aliases: ["account", "organisation", "employer", "client"] },
      { key: "job_title", label: "Job title", aliases: ["title", "role", "position", "designation"] },
      { key: "email", label: "Email", aliases: ["e-mail", "mail"] },
      { key: "phone", label: "Phone", aliases: ["telephone", "tel", "mobile", "gsm"] },
      { key: "notes", label: "Notes", aliases: ["remarks", "comment"] },
      owner,
    ],
  },
  {
    key: "crm-deals",
    label: "Opportunities",
    hint: "Pipeline. Value is read past currency symbols and thousands separators.",
    fields: [
      { key: "title", label: "Opportunity", required: true, aliases: ["deal", "name", "subject", "description", "project"] },
      { key: "company", label: "Company", aliases: ["account", "client", "customer"] },
      { key: "value", label: "Value", aliases: ["amount", "worth", "contract value", "revenue", "price"] },
      { key: "currency", label: "Currency", aliases: ["ccy"] },
      { key: "stage", label: "Stage", aliases: ["status", "pipeline stage"] },
      { key: "probability", label: "Probability %", aliases: ["chance", "likelihood", "confidence"] },
      { key: "expected_close", label: "Expected close", aliases: ["close date", "closing", "due", "target date"] },
      { key: "notes", label: "Notes", aliases: ["remarks", "comment"] },
      owner,
    ],
  },
  {
    key: "crm-leads",
    label: "Leads",
    hint: "Unqualified interest. Scored automatically once imported.",
    fields: [
      { key: "full_name", label: "Full name", required: true, aliases: ["name", "contact", "lead"] },
      { key: "company_name", label: "Company", aliases: ["account", "organisation", "employer"] },
      { key: "job_title", label: "Job title", aliases: ["title", "role", "designation"] },
      { key: "email", label: "Email", aliases: ["e-mail", "mail"] },
      { key: "phone", label: "Phone", aliases: ["telephone", "tel", "mobile", "gsm"] },
      { key: "source", label: "Source", aliases: ["channel", "origin", "how they found us"] },
      { key: "industry", label: "Industry", aliases: ["sector"] },
      { key: "estimated_value", label: "Estimated value", aliases: ["value", "amount", "budget"] },
      { key: "notes", label: "Notes", aliases: ["remarks", "comment"] },
      owner,
    ],
  },
];

export const findDataset = (key: string) => DATASETS.find((d) => d.key === key) ?? null;
