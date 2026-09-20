import { saveActivity, saveCompany, saveContact, saveDeal } from "@/lib/actions/crm";
import { ActionForm, ConfirmBtn, Select, SubmitBtn } from "@/components/form";
import { Field, Row } from "@/components/ui";

export type Opt = { id: number; name: string };

const STATUSES = ["lead", "prospect", "customer", "churned"];
const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const KINDS = ["call", "email", "meeting", "task", "note"];

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

export function CompanyForm({ owners, record }: { owners: Opt[]; record?: any }) {
  return (
    <ActionForm action={saveCompany} className="space-y-4">
      {record && <input type="hidden" name="id" value={record.id} />}
      <Field label="Company name">
        <input name="name" required defaultValue={record?.name} className="field" placeholder="e.g. Harmattan Logistics Ltd" />
      </Field>
      <Row>
        <Field label="Industry">
          <input name="industry" defaultValue={record?.industry ?? ""} className="field" placeholder="Logistics" />
        </Field>
        <Field label="Relationship">
          <Select name="status" defaultValue={record?.status ?? "lead"} className="field">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Email">
          <input name="email" type="email" defaultValue={record?.email ?? ""} className="field" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={record?.phone ?? ""} className="field" />
        </Field>
      </Row>
      <Row>
        <Field label="Website">
          <input name="website" defaultValue={record?.website ?? ""} className="field" placeholder="example.com" />
        </Field>
        <Field label="Headcount">
          <Select name="size" defaultValue={record?.size ?? ""} className="field">
            <option value="">Unknown</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Field label="Address">
        <input name="address" defaultValue={record?.address ?? ""} className="field" />
      </Field>
      <Field label="Account owner">
        <Select name="owner_id" defaultValue={record?.owner_id ?? ""} className="field">
          <option value="">Me</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={record?.notes ?? ""} className="field resize-y" />
      </Field>
      <SubmitBtn className="w-full">{record ? "Save changes" : "Add company"}</SubmitBtn>
    </ActionForm>
  );
}

export function ContactForm({ companies, owners, record }: { companies: Opt[]; owners: Opt[]; record?: any }) {
  return (
    <ActionForm action={saveContact} className="space-y-4">
      {record && <input type="hidden" name="id" value={record.id} />}
      <Field label="Full name">
        <input name="full_name" required defaultValue={record?.full_name} className="field" />
      </Field>
      <Row>
        <Field label="Job title">
          <input name="job_title" defaultValue={record?.job_title ?? ""} className="field" />
        </Field>
        <Field label="Company">
          <Select name="company_id" defaultValue={record?.company_id ?? ""} className="field">
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Email">
          <input name="email" type="email" defaultValue={record?.email ?? ""} className="field" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={record?.phone ?? ""} className="field" />
        </Field>
      </Row>
      <Field label="Relationship owner">
        <Select name="owner_id" defaultValue={record?.owner_id ?? ""} className="field">
          <option value="">Me</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-canvas p-3">
        <input type="checkbox" name="is_primary" defaultChecked={record?.is_primary} className="h-4 w-4 accent-brand-600" />
        <span className="text-sm font-bold">Primary contact for this company</span>
      </label>
      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={record?.notes ?? ""} className="field resize-y" />
      </Field>
      <SubmitBtn className="w-full">{record ? "Save changes" : "Add contact"}</SubmitBtn>
    </ActionForm>
  );
}

export function DealForm({
  companies,
  contacts,
  owners,
  stages,
  record,
}: {
  companies: Opt[];
  contacts: Opt[];
  owners: Opt[];
  /** From crm_stages, so the pipeline is configurable rather than hardcoded. */
  stages: { key: string; label: string }[];
  record?: any;
}) {
  return (
    <ActionForm action={saveDeal} className="space-y-4">
      {record && <input type="hidden" name="id" value={record.id} />}
      <Field label="Opportunity">
        <input name="title" required defaultValue={record?.title} className="field" placeholder="e.g. Annual fleet maintenance contract" />
      </Field>
      <Row>
        <Field label="Company">
          <Select name="company_id" defaultValue={record?.company_id ?? ""} className="field">
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact">
          <Select name="contact_id" defaultValue={record?.contact_id ?? ""} className="field">
            <option value="">None</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Value" hint="In the organisation's currency.">
          <input name="value" type="number" min="0" step="1000" defaultValue={record?.value ?? 0} className="field tabular" />
        </Field>
        <Field label="Stage">
          <Select name="stage" defaultValue={record?.stage ?? stages[0]?.key ?? "qualification"} className="field">
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Probability (%)">
          <input name="probability" type="number" min="0" max="100" step="5" defaultValue={record?.probability ?? 20} className="field tabular" />
        </Field>
        <Field label="Expected close">
          <input name="expected_close" type="date" defaultValue={record?.expected_close?.slice?.(0, 10) ?? ""} className="field" />
        </Field>
      </Row>
      <Field label="Owner">
        <Select name="owner_id" defaultValue={record?.owner_id ?? ""} className="field">
          <option value="">Me</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={record?.notes ?? ""} className="field resize-y" />
      </Field>
      <SubmitBtn className="w-full">{record ? "Save changes" : "Add opportunity"}</SubmitBtn>
    </ActionForm>
  );
}

export function ActivityForm({
  companies,
  contacts,
  deals,
  owners,
  presetDeal,
  presetCompany,
}: {
  companies: Opt[];
  contacts: Opt[];
  deals: Opt[];
  owners: Opt[];
  presetDeal?: number;
  presetCompany?: number;
}) {
  return (
    <ActionForm action={saveActivity} className="space-y-4" reset>
      <Row>
        <Field label="Type">
          <Select name="kind" className="field" defaultValue="task">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due">
          <input name="due_at" type="datetime-local" className="field" />
        </Field>
      </Row>
      <Field label="Subject">
        <input name="subject" required className="field" placeholder="e.g. Follow up on revised pricing" />
      </Field>
      <Row>
        <Field label="Opportunity">
          <Select name="deal_id" className="field" defaultValue={presetDeal ?? ""}>
            <option value="">None</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Company">
          <Select name="company_id" className="field" defaultValue={presetCompany ?? ""}>
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Contact">
          <Select name="contact_id" className="field" defaultValue="">
            <option value="">None</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner">
          <Select name="owner_id" className="field" defaultValue="">
            <option value="">Me</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Field label="Notes">
        <textarea name="notes" rows={3} className="field resize-y" />
      </Field>
      <SubmitBtn className="w-full">Log activity</SubmitBtn>
    </ActionForm>
  );
}
