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
    key: "customers",
    label: "Clients",
    hint: "Who this system invoices. The bill-to record only — sector, notes and the rest of the account history belong in the CRM.",
    fields: [
      { key: "name", label: "Customer name", required: true, aliases: ["company", "account", "organisation", "organization", "client", "coy name", "customer"] },
      { key: "email", label: "Email", aliases: ["e-mail"] },
      { key: "phone", label: "Phone", aliases: ["telephone", "tel", "mobile", "gsm", "contact number"] },
      { key: "address", label: "Address", aliases: ["location", "office"] },
      { key: "tax_id", label: "Tax ID / RC number", aliases: ["tin", "vat no", "rc number"] },
    ],
  },
  {
    key: "employees",
    label: "Employees",
    hint: "Staff records. Matched on email. New joiners get a temporary password you set below.",
    fields: [
      { key: "full_name", label: "Full name", required: true, aliases: ["name", "employee", "staff name"] },
      { key: "email", label: "Email", required: true, aliases: ["e-mail", "work email", "official email"] },
      { key: "staff_no", label: "Staff number", aliases: ["employee id", "staff id", "emp no", "payroll no"] },
      { key: "job_title", label: "Job title", aliases: ["title", "role", "designation", "position"] },
      { key: "department", label: "Department", aliases: ["dept", "unit", "division"] },
      { key: "phone", label: "Phone", aliases: ["telephone", "tel", "mobile", "gsm"] },
      { key: "role", label: "Access level", aliases: ["access", "permission", "system role"] },
      { key: "manager", label: "Line manager (email)", aliases: ["reports to", "supervisor", "manager email"] },
    ],
  },
  {
    key: "inventory",
    label: "Inventory items",
    hint: "Stock. Matched on SKU. Quantity sets the opening balance on new items only.",
    fields: [
      { key: "sku", label: "SKU", required: true, aliases: ["code", "item code", "part no", "product code"] },
      { key: "name", label: "Item name", required: true, aliases: ["description", "item", "product"] },
      { key: "category", label: "Category", aliases: ["type", "group", "class"] },
      { key: "unit", label: "Unit", aliases: ["uom", "measure", "unit of measure"] },
      { key: "quantity", label: "Quantity", aliases: ["qty", "stock", "on hand", "balance"] },
      { key: "reorder_level", label: "Reorder level", aliases: ["min", "minimum", "reorder point"] },
      { key: "unit_cost", label: "Unit cost", aliases: ["cost", "price", "rate", "unit price"] },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    hint: "Fixed asset register. Matched on asset tag.",
    fields: [
      { key: "tag", label: "Asset tag", required: true, aliases: ["asset no", "tag no", "asset id", "code"] },
      { key: "name", label: "Asset name", required: true, aliases: ["description", "item", "asset"] },
      { key: "category", label: "Category", aliases: ["type", "class"] },
      { key: "serial_no", label: "Serial number", aliases: ["serial", "sn", "imei"] },
      { key: "purchase_date", label: "Purchase date", aliases: ["acquired", "date bought", "acquisition date"] },
      { key: "purchase_cost", label: "Purchase cost", aliases: ["cost", "value", "price"] },
      { key: "location", label: "Location", aliases: ["site", "office", "where"] },
      { key: "status", label: "Status", aliases: ["condition", "state"] },
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    hint: "Supplier register. Matched on name.",
    fields: [
      { key: "name", label: "Vendor name", required: true, aliases: ["supplier", "company", "contractor"] },
      { key: "category", label: "Category", aliases: ["type", "service", "trade"] },
      { key: "email", label: "Email", aliases: ["e-mail"] },
      { key: "phone", label: "Phone", aliases: ["telephone", "tel", "mobile", "gsm"] },
      { key: "address", label: "Address", aliases: ["location"] },
      { key: "tax_id", label: "Tax ID", aliases: ["tin", "vat no", "rc number"] },
      { key: "bank_details", label: "Bank details", aliases: ["account", "bank", "account number"] },
    ],
  },
];

export const findDataset = (key: string) => DATASETS.find((d) => d.key === key) ?? null;
