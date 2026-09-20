import type { Group } from "@/components/shell";

/** Standalone ERP navigation. */
export const NAV: Group[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: "home", exact: true },
      { href: "/mail", label: "Email", icon: "mail", count: "mail" },
      { href: "/messages", label: "Messages", icon: "chat", count: "messages" },
      { href: "/inbox", label: "Inbox", icon: "inbox", count: "inbox" },
    ],
  },
  {
    label: "Communications",
    items: [
      { href: "/memos", label: "Memos & Circulars", icon: "doc", count: "memos" },
      { href: "/announcements", label: "Announcements", icon: "bell" },
      { href: "/directory", label: "Staff Directory", icon: "book" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/leave", label: "Leave", icon: "calendar", count: "leave" },
      { href: "/attendance", label: "Attendance", icon: "clock", count: "attendance" },
      { href: "/reports", label: "Reports", icon: "chart", count: "reports" },
      { href: "/requests", label: "Workflow Requests", icon: "workflow", count: "requests" },
      { href: "/timesheets", label: "Timesheets", icon: "clock", count: "timesheets" },
      { href: "/appraisals", label: "Appraisals", icon: "star" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/projects", label: "Projects", icon: "folder" },
      { href: "/procurement", label: "Procurement", icon: "cart", count: "procurement" },
      { href: "/inventory", label: "Inventory", icon: "box" },
      { href: "/assets", label: "Assets", icon: "wrench" },
    ],
  },
  {
    // Each item shows only if the person actually holds the capability behind
    // it, so a custom role sees exactly the administration it can use.
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Employees", icon: "users", caps: ["people.manage"] },
      { href: "/admin/roles", label: "Roles & Access", icon: "shield", caps: ["roles.manage"] },
      { href: "/admin/departments", label: "Departments", icon: "building", caps: ["people.departments"] },
      { href: "/admin/leave-types", label: "Leave Policy", icon: "calendar", caps: ["people.leave_policy"] },
      { href: "/admin/import", label: "Data Import", icon: "upload", caps: ["data.import"] },
      { href: "/admin/audit", label: "Audit Trail", icon: "shield", caps: ["audit.view"] },
    ],
  },
];
