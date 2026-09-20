import { can, canAny, getUser, type SessionUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { csvResponse } from "@/lib/csv";

class Forbidden extends Error {}

type Dataset = {
  /**
   * Capabilities, any one of which is enough. Omit to allow any signed-in employee.
   *
   * ponytail: this used to be a list of role NAMES, checked with
   * roles.includes(me.role). Once roles became data that quietly broke: a
   * custom role granted audit.view could open the Audit trail and then got a
   * 403 from the Export CSV button on that very page.
   */
  caps?: string[];
  columns: { key: string; label: string }[];
  rows: (me: SessionUser, q: URLSearchParams) => Promise<Record<string, unknown>[]>;
};

const col = (key: string, label: string) => ({ key, label });

// ponytail: one registry and one route rather than a file per download button.
const DATASETS: Record<string, Dataset> = {
  "memo-acknowledgements": {
    columns: [
      col("ref", "Reference"),
      col("title", "Document"),
      col("kind", "Type"),
      col("full_name", "Recipient"),
      col("staff_no", "Staff no"),
      col("department", "Department"),
      col("email", "Email"),
      col("read_at", "Read at"),
      col("acknowledged_at", "Signed at"),
      col("signed_version", "Signed version"),
      col("current_version", "Current version"),
      col("signature_current", "Still current"),
      col("signature_sha256", "Signature SHA-256"),
      col("password_confirmed", "Password confirmed"),
      col("signed_ip", "IP address"),
      col("signed_agent", "Device"),
    ],
    async rows(me, q) {
      const memoId = Number(q.get("memo"));
      if (!memoId) throw new Forbidden("A memo id is required.");
      const [memo] = await sql<{ author_id: number }>`select author_id from memos where id = ${memoId}`;
      if (!memo) throw new Forbidden("Memo not found.");
      if (memo.author_id !== me.id && !can(me, "memo.view_any"))
        throw new Forbidden("Only the author, HR or an administrator may export this register.");

      return sql`
        select m.ref, m.title, m.kind, u.full_name, u.staff_no, u.email, d.name as department,
               mr.read_at, mr.acknowledged_at, mr.signature_sha256,
               mr.acknowledged_version as signed_version, m.version as current_version,
               -- An auditor reading the CSV must not have to infer this.
               case when mr.acknowledged_at is null then null
                    when coalesce(mr.acknowledged_version, 1) >= m.version then 'yes'
                    else 'no - superseded' end as signature_current,
               mr.signed_with_password as password_confirmed, mr.signed_ip, mr.signed_agent
          from memo_recipients mr
          join memos m on m.id = mr.memo_id
          join users u on u.id = mr.user_id
          left join departments d on d.id = u.department_id
         where mr.memo_id = ${memoId}
         order by mr.acknowledged_at nulls last, u.full_name`;
    },
  },

  memos: {
    columns: [
      col("ref", "Reference"),
      col("kind", "Type"),
      col("title", "Subject"),
      col("author", "Author"),
      col("audience", "Audience"),
      col("department", "Department"),
      col("priority", "Priority"),
      col("status", "Status"),
      col("requires_ack", "Signature required"),
      col("published_at", "Published"),
      col("reach", "Recipients"),
      col("reads", "Read"),
      col("acks", "Signed"),
      col("body", "Body"),
    ],
    async rows(me) {
      // Recipients see what was addressed to them; authors see their own.
      // ponytail: this widened on people.view_all — a capability about leave and
      // requests. A custom role with that but not memo.view_any would have
      // exported every memo BODY in the company.
      const wide = can(me, "memo.view_any");
      return sql`
        select m.ref, m.kind, m.title, u.full_name as author, m.audience, d.name as department,
               m.priority, m.status, m.requires_ack, m.published_at, m.body,
               (select count(*) from memo_recipients r where r.memo_id = m.id)::int as reach,
               (select count(*) from memo_recipients r where r.memo_id = m.id and r.read_at is not null)::int as reads,
               (select count(*) from memo_recipients r where r.memo_id = m.id and r.acknowledged_at is not null)::int as acks
          from memos m
          join users u on u.id = m.author_id
          left join departments d on d.id = m.department_id
         where ${wide} or m.author_id = ${me.id}
            or exists (select 1 from memo_recipients r where r.memo_id = m.id and r.user_id = ${me.id})
         order by coalesce(m.published_at, m.created_at) desc`;
    },
  },

  "leave-requests": {
    columns: [
      col("ref", "Reference"),
      col("staff", "Employee"),
      col("staff_no", "Staff no"),
      col("department", "Department"),
      col("type", "Leave type"),
      col("start_date", "First day"),
      col("end_date", "Last day"),
      col("days", "Working days"),
      col("status", "Status"),
      col("reason", "Reason"),
      col("approver", "Approver"),
      col("decided_at", "Decided at"),
      col("decision_note", "Decision note"),
      col("created_at", "Applied at"),
    ],
    async rows(me) {
      // Staff see only their own; managers add their reports; HR and admin see all.
      const wide = can(me, "people.view_all");
      return sql`
        select lr.ref, u.full_name as staff, u.staff_no, d.name as department, lt.name as type,
               lr.start_date, lr.end_date, lr.days, lr.status, lr.reason,
               a.full_name as approver, lr.decided_at, lr.decision_note, lr.created_at
          from leave_requests lr
          join users u on u.id = lr.user_id
          join leave_types lt on lt.id = lr.leave_type_id
          left join departments d on d.id = u.department_id
          left join users a on a.id = lr.approver_id
         where ${wide} or lr.user_id = ${me.id} or u.manager_id = ${me.id}
         order by lr.created_at desc`;
    },
  },

  "workflow-requests": {
    columns: [
      col("ref", "Reference"),
      col("title", "Request"),
      col("category", "Category"),
      col("priority", "Priority"),
      col("status", "Status"),
      col("requester", "Raised by"),
      col("assignee", "Assigned to"),
      col("department", "Queue"),
      col("on_behalf_of", "On behalf of"),
      col("resolution", "Decision"),
      col("due_date", "Needed by"),
      col("created_at", "Raised at"),
      col("completed_at", "Completed at"),
      col("replies", "Updates"),
    ],
    async rows(me) {
      const wide = can(me, "people.view_all");
      return sql`
        select r.ref, r.title, r.category, r.priority, r.status,
               req.full_name as requester, asg.full_name as assignee,
               d.name as department, r.on_behalf_of, r.resolution,
               r.due_date, r.created_at, r.completed_at,
               (select count(*) from workflow_comments c where c.request_id = r.id)::int as replies
          from workflow_requests r
          join users req on req.id = r.requester_id
          -- Left joins: an unclaimed request has no assignee, and an inner join
          -- would silently drop every queued request out of the export.
          left join users asg on asg.id = r.assignee_id
          left join departments d on d.id = r.department_id
         where ${wide} or r.requester_id = ${me.id} or r.assignee_id = ${me.id}
            or (r.assignee_id is null and r.department_id = ${me.department_id ?? 0})
         order by r.created_at desc`;
    },
  },

  /**
   * ponytail: the Assets, Expenses and Invoices pages all carried an
   * "Export CSV" button pointing at a dataset that was never registered, so all
   * three returned 404. Scoped the way their pages are: assets and one's own
   * expense claims are open, the sales ledger is not.
   */
  assets: {
    columns: [
      col("tag", "Asset tag"),
      col("name", "Asset"),
      col("category", "Category"),
      col("serial_no", "Serial number"),
      col("location", "Location"),
      col("status", "Status"),
      col("holder", "Held by"),
      col("vendor", "Supplier"),
      col("purchase_date", "Purchased"),
      col("purchase_cost", "Cost"),
      col("useful_life_years", "Useful life (years)"),
    ],
    async rows() {
      return sql`
        select a.tag, a.name, a.category, a.serial_no, a.location, a.status,
               (select u.full_name from asset_assignments aa
                  join users u on u.id = aa.user_id
                 where aa.asset_id = a.id and aa.returned_on is null
                 order by aa.assigned_on desc limit 1) as holder,
               v.name as vendor, a.purchase_date, a.purchase_cost, a.useful_life_years
          from assets a left join vendors v on v.id = a.vendor_id
         order by a.tag`;
    },
  },

  expenses: {
    columns: [
      col("ref", "Reference"),
      col("claimant", "Claimed by"),
      col("department", "Department"),
      col("category", "Category"),
      col("description", "Description"),
      col("amount", "Amount"),
      col("currency", "Currency"),
      col("spent_on", "Spent on"),
      col("status", "Status"),
      col("approver", "Approved by"),
      col("second_approver", "Countersigned by"),
      col("has_receipt", "Receipt attached"),
      col("created_at", "Claimed"),
    ],
    async rows(me) {
      // Everyone can export their own claims; deciding them is what widens it.
      const wide = can(me, "expense.approve");
      return sql`
        select e.ref, u.full_name as claimant, d.name as department, e.category, e.description,
               e.amount, e.currency, e.spent_on, e.status,
               a.full_name as approver, a2.full_name as second_approver,
               (e.receipt_id is not null) as has_receipt, e.created_at
          from expenses e
          join users u on u.id = e.user_id
          left join departments d on d.id = u.department_id
          left join users a on a.id = e.approver_id
          left join users a2 on a2.id = e.second_approver_id
         where ${wide} or e.user_id = ${me.id}
         order by e.created_at desc`;
    },
  },

  invoices: {
    caps: ["invoice.manage"],
    columns: [
      col("ref", "Reference"),
      col("kind", "Type"),
      col("party", "Client or supplier"),
      col("project", "Project"),
      col("issue_date", "Issued"),
      col("due_date", "Due"),
      col("currency", "Currency"),
      col("subtotal", "Subtotal"),
      col("tax_amount", "VAT"),
      col("total", "Total"),
      col("amount_paid", "Paid"),
      col("outstanding", "Outstanding"),
      col("status", "Status"),
      col("raised_by", "Raised by"),
    ],
    async rows() {
      return sql`
        select i.ref, i.kind, coalesce(c.name, v.name) as party, p.name as project,
               i.issue_date, i.due_date, i.currency, i.subtotal, i.tax_amount, i.total,
               i.amount_paid, (i.total - i.amount_paid) as outstanding, i.status,
               u.full_name as raised_by
          from invoices i
          left join customers c on c.id = i.customer_id
          left join vendors v on v.id = i.vendor_id
          left join projects p on p.id = i.project_id
          left join users u on u.id = i.created_by
         order by i.issue_date desc, i.id desc`;
    },
  },

  employees: {
    caps: ["people.manage"],
    columns: [
      col("staff_no", "Staff no"),
      col("full_name", "Name"),
      col("email", "Work email"),
      col("phone", "Phone"),
      col("job_title", "Job title"),
      col("department", "Department"),
      col("manager", "Reports to"),
      col("role", "Access level"),
      col("status", "Status"),
      col("has_signature", "Signature on file"),
      col("last_login_at", "Last sign-in"),
      col("created_at", "Added"),
    ],
    async rows() {
      return sql`
        select u.staff_no, u.full_name, u.email, u.phone, u.job_title, d.name as department,
               m.full_name as manager, u.role, u.status,
               (u.signature is not null) as has_signature, u.last_login_at, u.created_at
          from users u
          left join departments d on d.id = u.department_id
          left join users m on m.id = u.manager_id
         order by u.full_name`;
    },
  },

  /**
   * Attendance. Deliberately has no `caps` gate: every employee may export
   * their own record with `?me=1`, and only the register-holder may export
   * everybody's. Gating the whole dataset on `attendance.view_all` would have
   * put the Download CSV button on an employee's own page behind HR's authority.
   */
  attendance: {
    columns: [
      col("full_name", "Employee"),
      col("staff_no", "Staff no"),
      col("department", "Department"),
      col("work_date", "Date"),
      col("clocked_in_at", "Clocked in"),
      col("clocked_out_at", "Clocked out"),
      col("hours", "Hours"),
      col("minutes", "Minutes"),
      col("in_note", "Arrival note"),
      col("out_note", "Departure note"),
      col("in_ip", "Clock-in address"),
      col("out_ip", "Clock-out address"),
    ],
    async rows(me, q) {
      const mine = q.get("me") === "1";
      if (!mine && !can(me, "attendance.view_all"))
        throw new Forbidden("Only the attendance register holder may export everybody's attendance.");

      const today = new Date().toISOString().slice(0, 10);
      const from = q.get("from") || `${today.slice(0, 7)}-01`;
      const to = q.get("to") || today;
      const userId = mine ? me.id : Number(q.get("user")) || 0;
      const deptId = Number(q.get("dept")) || 0;

      const rows = await sql<Record<string, unknown>>`
        select u.full_name, u.staff_no, d.name as department, a.work_date,
               a.clocked_in_at, a.clocked_out_at, a.minutes, a.in_note, a.out_note, a.in_ip, a.out_ip
          from attendance_entries a
          join users u on u.id = a.user_id
          left join departments d on d.id = u.department_id
         where a.work_date between ${from}::date and ${to}::date
           and (${userId} = 0 or a.user_id = ${userId})
           and (${deptId} = 0 or u.department_id = ${deptId})
         order by a.work_date desc, u.full_name, a.clocked_in_at
         limit 20000`;

      // Payroll adds up a decimal, not "7h 45m".
      return rows.map((r) => ({
        ...r,
        hours: r.minutes == null ? "" : (Number(r.minutes) / 60).toFixed(2),
      }));
    },
  },

  reports: {
    caps: ["report.view_all"],
    columns: [
      col("ref", "Reference"),
      col("kind", "Type"),
      col("period_start", "Period start"),
      col("period_end", "Period end"),
      col("title", "Title"),
      col("full_name", "Submitted by"),
      col("staff_no", "Staff no"),
      col("department", "Department"),
      col("status", "Status"),
      col("submitted_at", "Submitted at"),
      col("files", "Files"),
      col("reviewer", "Reviewed by"),
      col("reviewed_at", "Reviewed at"),
      col("review_note", "Review note"),
      col("summary", "Summary"),
    ],
    async rows(_me, q) {
      const kind = q.get("kind");
      const from = q.get("from");
      const to = q.get("to");
      return sql`
        select r.ref, r.kind, r.period_start, r.period_end, r.title, u.full_name, u.staff_no,
               d.name as department, r.status, r.submitted_at, r.review_note, r.summary,
               rv.full_name as reviewer, r.reviewed_at,
               coalesce((select string_agg(a.name, ' | ' order by a.name)
                           from report_files rf join attachments a on a.id = rf.attachment_id
                          where rf.report_id = r.id), '') as files
          from staff_reports r
          join users u on u.id = r.user_id
          left join departments d on d.id = u.department_id
          left join users rv on rv.id = r.reviewed_by
         where (${kind ?? null}::text is null or r.kind = ${kind ?? null})
           and (${from ?? null}::date is null or r.period_start >= ${from ?? null}::date)
           and (${to ?? null}::date is null or r.period_start <= ${to ?? null}::date)
         order by r.period_start desc, u.full_name
         limit 10000`;
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
