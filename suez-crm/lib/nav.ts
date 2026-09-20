import type { Group } from "@/components/shell";

/**
 * Standalone CRM navigation.
 *
 * ponytail: Automations, Communications and Lead Capture have gone — workflow
 * rules nobody maintained, an omnichannel inbox whose WhatsApp and SMS sides
 * were never connected to a provider, and public capture forms. What is left is
 * what business development, client relations, administration and the MD
 * actually open.
 */
export const NAV: Group[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: "home", exact: true },
      { href: "/reports", label: "Reports", icon: "chart", caps: ["report.view"] },
      { href: "/inbox", label: "Inbox", icon: "inbox", count: "notifications" },
    ],
  },
  {
    label: "Business development",
    items: [
      { href: "/leads", label: "Leads", icon: "target" },
      { href: "/deals", label: "Pipeline", icon: "trending" },
      { href: "/quotes", label: "Quotes", icon: "receipt" },
      { href: "/activities", label: "Activities", icon: "check" },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/companies", label: "Companies", icon: "building" },
      { href: "/contacts", label: "Contacts", icon: "contact" },
      { href: "/deposits", label: "Deposit Accounts", icon: "cash", count: "deposits" },
      { href: "/tickets", label: "Support Tickets", icon: "wrench" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/finance", label: "Finance overview", icon: "cash", caps: ["invoice.manage", "expense.approve", "budget.manage", "deposit.view"] },
      { href: "/finance/invoices", label: "Invoices", icon: "receipt", caps: ["invoice.manage"] },
      { href: "/finance/expenses", label: "Expenses", icon: "cash" },
      { href: "/finance/budgets", label: "Budgets", icon: "chart", caps: ["budget.manage"] },
      { href: "/deposits", label: "Deposit accounts", icon: "cash", caps: ["deposit.view"] },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: "send" },
      { href: "/segments", label: "Segments", icon: "tag" },
    ],
  },
  {
    // Each item shows only if the person actually holds the capability behind
    // it, so a custom role sees exactly the administration it can use.
    label: "Administration",
    items: [
      { href: "/import", label: "Import from Excel", icon: "upload", caps: ["data.import"] },
      { href: "/users", label: "Users", icon: "contact", caps: ["people.manage"] },
      { href: "/roles", label: "Roles & Access", icon: "shield", caps: ["roles.manage"] },
      { href: "/settings/email", label: "Email & Notifications", icon: "mail", caps: ["channels.manage"] },
      { href: "/audit", label: "Audit Trail", icon: "shield", caps: ["audit.view"] },
    ],
  },
];
