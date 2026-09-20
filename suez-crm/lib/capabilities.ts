/**
 * What the system can be asked to allow, as a fixed list.
 *
 * Capabilities live in code because the code is what checks them — a capability
 * nobody calls `can()` for would be a lie on the Roles screen. Roles, and which
 * capabilities each role holds, live in the database and are yours to change.
 *
 * ponytail: the CRM inherited four hardcoded role names from the ERP and never
 * had a screen to manage either roles or users, so "who can delete an account?"
 * was answerable only by reading lib/permissions.ts.
 *
 * Most of this CRM is governed by ownership rather than by role — a rep works
 * their own accounts, deals and quotes — so this list is deliberately short.
 * The capabilities here are the ones that reach across other people's records.
 */

export type Capability = {
  key: string;
  label: string;
  /** Grouped for the Roles screen. */
  group: string;
  /** Shown under the checkbox — say what it lets someone do, plainly. */
  hint: string;
};

export const CAPABILITIES: Capability[] = [
  // Working across the team --------------------------------------------------
  { key: "record.edit_any", group: "Team records", label: "Edit anyone's records",
    hint: "Change accounts, contacts, opportunities and quotes belonging to another rep. Without this they work their own." },
  { key: "record.reassign", group: "Team records", label: "Reassign ownership",
    hint: "Move an account or opportunity to a different rep. The previous owner is notified." },
  { key: "record.delete", group: "Team records", label: "Delete accounts, contacts and opportunities",
    hint: "A deleted account takes its contacts, deals and quote history with it." },

  // Customer deposits --------------------------------------------------------
  { key: "deposit.view", group: "Client money", label: "See every deposit account",
    hint: "Funded accounts across the company, not only those on accounts they own." },
  { key: "deposit.manage", group: "Client money", label: "Record funding and drawdowns",
    hint: "Open a deposit account, record money received, and draw it down as goods are supplied. Every entry is stamped with who recorded it." },
  { key: "deposit.adjust", group: "Client money", label: "Correct a deposit ledger",
    hint: "Post an adjustment or a refund against a funded account. Meant for finance and the MD — an ordinary drawdown does not need it." },
  { key: "invoice.manage", group: "Finance", label: "Manage invoices and payments",
    hint: "Create client invoices and record payments in the CRM." },
  { key: "expense.approve", group: "Finance", label: "Approve expense claims",
    hint: "Review, approve, reject, and mark employee expenses reimbursed." },
  { key: "budget.manage", group: "Finance", label: "Manage budgets",
    hint: "Set and review department, campaign, or operating budgets." },

  // Visibility ---------------------------------------------------------------
  { key: "report.view", group: "Visibility", label: "See reports",
    hint: "The pipeline, win rate and closed business the team shares. Without this the Reports page is hidden entirely." },
  { key: "report.view_owners", group: "Visibility", label: "Compare colleagues",
    hint: "The performance-by-owner table, which ranks each rep by open and won value. The totals are visible without it." },
  { key: "report.manage", group: "Visibility", label: "Build dashboard KPIs",
    hint: "Create and remove shared KPI cards on the Reports dashboard." },

  // Administration -----------------------------------------------------------
  { key: "data.import", group: "Administration", label: "Import from spreadsheets",
    hint: "Bring companies, contacts, opportunities and leads in from Excel." },
  { key: "audit.view", group: "Administration", label: "View the audit trail",
    hint: "Every recorded action across the CRM, and export it." },
  { key: "people.manage", group: "Administration", label: "Manage users",
    hint: "Add and edit people, set their access level and reset passwords." },
  { key: "roles.manage", group: "Administration", label: "Manage roles",
    hint: "Create roles and decide what each one can do. Grant with care — it can grant itself." },
  { key: "channels.manage", group: "Administration", label: "Manage email and notifications",
    hint: "The outgoing mail server, and which events send an email as well as an in-app notification." },
];

export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key);

export const CAPABILITY_GROUPS = [...new Set(CAPABILITIES.map((c) => c.group))];

export const capabilitiesIn = (group: string) => CAPABILITIES.filter((c) => c.group === group);

export const capability = (key: string) => CAPABILITIES.find((c) => c.key === key) ?? null;

/**
 * The roles the system ships with.
 *
 * ponytail: Reports used to include a performance-by-owner table ranking every
 * rep by won value, shown to everyone. The pipeline board is deliberately
 * shared — the whole team sees the whole board — so scoping the totals would
 * only have hidden arithmetic anybody could do by hand. What needed gating was
 * the comparison of colleagues, and that is `report.view_owners`.
 */
export const BUILTIN_ROLES: { key: string; name: string; description: string; caps: string[] }[] = [
  {
    key: "admin",
    name: "Administrator",
    description: "Full reach over the CRM and its configuration.",
    caps: CAPABILITY_KEYS,
  },
  {
    key: "hr",
    name: "Human Resources",
    description: "Administers people and can see the whole picture.",
    caps: ["record.edit_any", "record.reassign", "record.delete", "report.view", "report.view_owners", "report.manage", "deposit.view", "deposit.manage", "deposit.adjust", "invoice.manage", "expense.approve", "budget.manage",
             "data.import", "audit.view", "people.manage"],
  },
  {
    key: "manager",
    name: "Sales Manager",
    description: "Runs a sales team: works across their reps' records and reassigns work.",
    caps: ["record.edit_any", "record.reassign", "record.delete", "report.view", "report.view_owners", "report.manage", "deposit.view", "deposit.manage", "invoice.manage", "expense.approve", "budget.manage", "data.import"],
  },
  {
    key: "staff",
    name: "Sales",
    description: "Works their own accounts, opportunities, quotes and tickets.",
    caps: ["report.view"],
  },
];
