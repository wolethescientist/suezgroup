import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { createRequest } from "@/lib/actions/requests";
import { ActionForm, Select, SubmitBtn } from "@/components/form";
import { RequestTarget } from "@/components/request-target";
import { Field, PageHeader } from "@/components/ui";

export const metadata = { title: "Raise a request" };

const CATEGORIES = [
  ["document", "Document or record"],
  ["approval", "Approval / sign-off"],
  ["it_support", "IT support"],
  ["procurement", "Procurement"],
  ["finance", "Finance"],
  ["hr", "HR"],
  ["facility", "Facilities"],
  ["other", "Other"],
];

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const me = await requireUser();
  const { to } = await searchParams;
  const [people, departments] = await Promise.all([
    sql<{ id: number; full_name: string; job_title: string | null; department: string | null }>`
      select u.id, u.full_name, u.job_title, d.name as department
        from users u left join departments d on d.id = u.department_id
       where u.status = 'active' and u.id <> ${me.id}
       order by u.full_name`,
    // An empty department is not a queue anybody is watching, so the count is
    // shown and departments with nobody in them are left out.
    sql<{ id: number; name: string; staff: number }>`
      select d.id, d.name,
             (select count(*) from users u where u.department_id = d.id and u.status = 'active')::int as staff
        from departments d
       where exists (select 1 from users u where u.department_id = d.id and u.status = 'active')
       order by d.name`,
  ]);

  return (
    <>
      <PageHeader
        title="Raise a request"
        subtitle="Send it to a colleague, or to a whole department for whoever is free to pick up."
      />

      <ActionForm action={createRequest} className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-4 p-5 lg:col-span-2">
          <Field label="What do you need?">
            <input name="title" required placeholder="e.g. Signed copy of the Q2 management accounts" className="field" />
          </Field>
          <Field label="Details" hint="Give enough context that no one has to ask.">
            <textarea name="description" rows={7} className="field resize-y" placeholder="Purpose, format required, who it is for…" />
          </Field>
          <Field
            label="On behalf of"
            hint="Optional. The customer or colleague waiting on this — so whoever picks it up knows who they are answering to."
          >
            <input name="on_behalf_of" className="field" maxLength={140} placeholder="e.g. Lagoon Estates — Mrs Ajayi, on the phone now" />
          </Field>
          <Field label="Attachment" hint="Optional — a form, template or reference document, up to 20 MB.">
            <input type="file" name="attachment" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="card space-y-4 p-5">
            <RequestTarget
              people={people}
              departments={departments}
              canQueue={can(me, "request.route_department")}
              defaultAssignee={to}
            />
            <Field label="Categories" hint="Choose every category that applies.">
              <select name="categories" multiple defaultValue={["document"]} className="field min-h-32">
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Approval trail" hint="Optional. Select people in the order they must approve. The final sign-off must be one of them.">
              <select name="approval_users" multiple className="field min-h-28">{people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.job_title ? ` — ${p.job_title}` : ""}</option>)}</select>
            </Field>
            <Field label="Final sign-off" hint="Only this person can give the final approval.">
              <Select name="final_approver_id" className="field"><option value="">No approval trail</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" className="field" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
            <Field label="Needed by" hint="Optional. Overdue requests are flagged in red.">
              <input type="date" name="due_date" className="field" min={new Date().toISOString().slice(0, 10)} />
            </Field>
          </div>
          <div className="card p-5">
            <SubmitBtn className="w-full">Send request</SubmitBtn>
          </div>
        </div>
      </ActionForm>
    </>
  );
}
