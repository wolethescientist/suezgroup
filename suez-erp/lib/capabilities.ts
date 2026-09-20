/**
 * What the system can be asked to allow, as a fixed list.
 *
 * Capabilities live in code because the code is what checks them — a capability
 * nobody calls `can()` for would be a lie on the Roles screen. Roles, and which
 * capabilities each role holds, live in the database and are yours to change.
 *
 * ponytail: before this, authority was six hardcoded role names spread across
 * about a hundred `requireRole("admin","hr")` and `u.role === "manager"` checks,
 * so adding a role meant a code change and a deploy, and nobody could answer
 * "what exactly can Finance do?" without reading the source.
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
  // People and the organisation ---------------------------------------------
  { key: "people.manage", group: "People", label: "Manage employees",
    hint: "Add and edit staff records, set access levels and reset passwords." },
  { key: "people.departments", group: "People", label: "Manage departments",
    hint: "Create departments, appoint heads, and delete empty ones." },
  { key: "people.leave_policy", group: "People", label: "Manage leave policy",
    hint: "Leave types, annual entitlements and individual balance adjustments." },
  { key: "people.view_all", group: "People", label: "See everyone's records",
    hint: "Leave, requests and timesheets across the company, not just their own team." },
  { key: "appraisal.cycle", group: "People", label: "Open appraisal cycles",
    hint: "Start a review cycle for every employee, and waive a missing self-review." },
  { key: "attendance.view_all", group: "People", label: "See the attendance register",
    hint: "Everyone's clock-in and clock-out times, and the CSV of them. Without it, people see only their own." },
  { key: "attendance.amend", group: "People", label: "Amend attendance",
    hint: "Correct a forgotten clock-out or a wrong time, with the reason kept on the record." },
  { key: "report.view_all", group: "People", label: "Receive weekly and monthly reports",
    hint: "Read and download every submitted report, chase the people who have not sent one, and export the register." },

  // Communications -----------------------------------------------------------
  { key: "memo.publish", group: "Communications", label: "Publish memos and circulars",
    hint: "Issue a document to a department or to named people. Without this they can only draft." },
  { key: "memo.publish.policy", group: "Communications", label: "Issue policies and company-wide notices",
    hint: "Publish a policy, address the whole company, or require a signature." },
  { key: "memo.view_any", group: "Communications", label: "Read any memo",
    hint: "Open documents they were not sent, and view the signature register." },
  { key: "document.route", group: "Communications", label: "Send documents for approval and signature",
    hint: "Route a draft to a head of department or an executive with an instruction, and get it back signed." },
  { key: "announcement.post", group: "Communications", label: "Post announcements",
    hint: "Put a notice on the company noticeboard." },
  { key: "announcement.manage", group: "Communications", label: "Remove announcements",
    hint: "Take down anybody's notice." },

  // Approvals ----------------------------------------------------------------
  { key: "leave.approve_any", group: "Approvals", label: "Approve anyone's leave",
    hint: "Decide leave outside their own team. Line managers can always decide their own reports." },
  { key: "leave.approve_executive", group: "Approvals", label: "Approve an approver's own leave",
    hint: "Decide leave for the people who decide everyone else's — HR, and anyone else holding 'Approve anyone's leave'. Meant for the MD, the Chairman or whoever stands in for them." },
  { key: "timesheet.approve_any", group: "Approvals", label: "Approve anyone's timesheet",
    hint: "Decide timesheets outside their own team." },
  { key: "request.view_all", group: "Approvals", label: "See all workflow requests",
    hint: "Every request in the company, not only the ones they raised or were assigned." },
  { key: "request.override", group: "Approvals", label: "Act on any workflow request",
    hint: "Progress or cancel a request they neither raised nor were assigned." },
  { key: "request.route_department", group: "Approvals", label: "Send requests to a department queue",
    hint: "Raise a request against a whole department instead of one named person, for whoever is free to pick up." },

  // Finance ------------------------------------------------------------------
  { key: "invoice.manage", group: "Finance", label: "Raise invoices and record payments",
    hint: "Sales and purchase invoices, their status, and money received against them." },
  { key: "expense.approve", group: "Finance", label: "Decide expense claims",
    hint: "Approve, reject and reimburse. Nobody may decide their own claim." },
  { key: "budget.manage", group: "Finance", label: "Manage budgets",
    hint: "Set and remove allocations, and see spend against them." },
  { key: "customer.manage", group: "Finance", label: "Manage clients",
    hint: "The register of who the company invoices." },

  // Procurement and operations ----------------------------------------------
  { key: "vendor.manage", group: "Procurement", label: "Manage suppliers",
    hint: "Add and edit the supplier register." },
  { key: "vendor.delete", group: "Procurement", label: "Delete suppliers",
    hint: "Remove a supplier outright. Only possible when they have no orders." },
  { key: "requisition.approve", group: "Procurement", label: "Approve requisitions",
    hint: "Decide purchase requests. A department head can always decide their own department's." },
  { key: "po.manage", group: "Procurement", label: "Raise and receive purchase orders",
    hint: "Create orders, send them, and record what arrived." },
  { key: "inventory.manage", group: "Procurement", label: "Manage stock",
    hint: "Stock items, movements in and out, and storage locations." },
  { key: "asset.manage", group: "Procurement", label: "Manage assets",
    hint: "The fixed asset register and who holds what." },

  // Administration -----------------------------------------------------------
  { key: "data.import", group: "Administration", label: "Import from spreadsheets",
    hint: "Bring employees, stock, assets, suppliers and clients in from Excel." },
  { key: "audit.view", group: "Administration", label: "View the audit trail",
    hint: "Every recorded action across the portal, and export it." },
  { key: "settings.organisation", group: "Administration", label: "Change organisation settings",
    hint: "Company details, currency, financial year and the acknowledgement policy." },
  { key: "settings.email", group: "Administration", label: "Change email settings",
    hint: "The outgoing mail server used for notifications." },
  { key: "roles.manage", group: "Administration", label: "Manage roles",
    hint: "Create roles and decide what each one can do. Grant with care — it can grant itself." },
];

export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key);

export const CAPABILITY_GROUPS = [...new Set(CAPABILITIES.map((c) => c.group))];

export const capabilitiesIn = (group: string) => CAPABILITIES.filter((c) => c.group === group);

export const capability = (key: string) => CAPABILITIES.find((c) => c.key === key) ?? null;

/**
 * The roles the system ships with, and exactly what they could do before roles
 * became editable. Seeding from this keeps day-one behaviour identical.
 */
export const BUILTIN_ROLES: { key: string; name: string; description: string; caps: string[] }[] = [
  {
    key: "admin",
    name: "Administrator",
    description: "Full reach over people, money, operations and configuration.",
    caps: CAPABILITY_KEYS,
  },
  {
    key: "hr",
    name: "Human Resources",
    description: "People administration, company communications and the audit trail.",
    caps: [
      "people.manage", "people.departments", "people.leave_policy", "people.view_all",
      "appraisal.cycle", "attendance.view_all", "attendance.amend", "report.view_all",
      "memo.publish", "memo.publish.policy", "memo.view_any", "document.route",
      "announcement.post", "announcement.manage", "leave.approve_any", "timesheet.approve_any",
      "request.view_all", "request.route_department",
      "data.import", "audit.view", "settings.organisation", "settings.email",
    ],
  },
  {
    key: "manager",
    name: "Manager",
    description: "Runs a team. Approves their own reports and writes to their department.",
    caps: [
      "memo.publish", "document.route", "announcement.post", "customer.manage", "data.import",
      "request.route_department",
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Invoices, payments, expense claims and budgets.",
    caps: [
      "invoice.manage", "expense.approve", "budget.manage", "customer.manage", "po.manage",
      "request.route_department",
    ],
  },
  {
    key: "procurement",
    name: "Procurement",
    description: "Suppliers, purchase orders, stock and the asset register.",
    caps: [
      "vendor.manage", "requisition.approve", "po.manage", "inventory.manage", "asset.manage",
      "request.route_department",
    ],
  },
  {
    key: "staff",
    name: "Staff",
    description: "Everyday access: their own leave, timesheets, expenses and requests.",
    /**
     * Two capabilities, neither of which is authority over anybody.
     *
     * `request.route_department` lets them send a request to a department queue
     * instead of walking over to find a person. `document.route` lets them send
     * a document they wrote up to a head of department to be approved and
     * signed — which is the thing that was being done on paper. Publishing a
     * document to an audience is still `memo.publish`, which they do not hold.
     */
    caps: ["request.route_department", "document.route"],
  },
];
