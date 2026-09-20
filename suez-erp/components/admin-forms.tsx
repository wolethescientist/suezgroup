import { adjustBalance, resetPassword, saveDepartment, saveLeaveType, saveUser } from "@/lib/actions/admin";
import { ActionForm, Select, SubmitBtn } from "@/components/form";
import { Field, Row } from "@/components/ui";

type Opt = { id: number; name: string };

export function UserForm({
  departments,
  managers,
  roles,
  record,
  canGrantAdmin,
}: {
  departments: Opt[];
  managers: Opt[];
  /** From the roles table, so a role created under Roles & Access is assignable here. */
  roles: { key: string; name: string; description: string | null }[];
  record?: any;
  canGrantAdmin: boolean;
}) {
  return (
    <ActionForm action={saveUser} className="space-y-4">
      {record && <input type="hidden" name="id" value={record.id} />}
      <Row>
        <Field label="Full name">
          <input name="full_name" required defaultValue={record?.full_name} className="field" />
        </Field>
        <Field label="Staff number">
          <input name="staff_no" defaultValue={record?.staff_no ?? ""} className="field" placeholder="SZ-011" />
        </Field>
      </Row>
      <Row>
        <Field label="Work email">
          <input name="email" type="email" required defaultValue={record?.email} className="field" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={record?.phone ?? ""} className="field" />
        </Field>
      </Row>
      <Row>
        <Field label="Job title">
          <input name="job_title" defaultValue={record?.job_title ?? ""} className="field" />
        </Field>
        <Field label="Department">
          <Select name="department_id" defaultValue={record?.department_id ?? ""} className="field">
            <option value="">Unassigned</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Line manager" hint="Leave requests route here.">
          <Select name="manager_id" defaultValue={record?.manager_id ?? ""} className="field">
            <option value="">None — route to HR</option>
            {managers
              .filter((m) => m.id !== record?.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Access level" hint="What each role can do is set under Roles & Access.">
          <Select name="role" defaultValue={record?.role ?? "staff"} className="field">
            {roles
              // Only an administrator hands out administrator.
              .filter((r) => canGrantAdmin || r.key !== "admin")
              .map((r) => (
                <option key={r.key} value={r.key}>
                  {r.description ? `${r.name} — ${r.description}` : r.name}
                </option>
              ))}
          </Select>
        </Field>
      </Row>
      {record ? (
        <Field label="Account status">
          <Select name="status" defaultValue={record.status} className="field">
            <option value="active">Active</option>
            <option value="suspended">Suspended — cannot sign in</option>
          </Select>
        </Field>
      ) : (
        <Field label="Starting password" hint="Minimum 8 characters. The employee can change it after signing in.">
          <input name="password" type="password" className="field" defaultValue="Welcome123!" />
        </Field>
      )}
      <SubmitBtn className="w-full">{record ? "Save employee" : "Add employee"}</SubmitBtn>
    </ActionForm>
  );
}

export function ResetPasswordForm({ user }: { user: { id: number; full_name: string } }) {
  return (
    <ActionForm action={resetPassword} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <p className="text-sm font-medium text-ink-soft">
        Set a temporary password for {user.full_name} and share it securely. They are notified in the portal.
      </p>
      <Field label="New password" hint="Minimum 8 characters.">
        <input name="password" type="password" required minLength={8} className="field" defaultValue="Welcome123!" />
      </Field>
      <SubmitBtn variant="danger" className="w-full">
        Reset password
      </SubmitBtn>
    </ActionForm>
  );
}

export function DepartmentForm({ heads, record }: { heads: Opt[]; record?: any }) {
  return (
    <ActionForm action={saveDepartment} className="space-y-4">
      {record && <input type="hidden" name="id" value={record.id} />}
      <Row>
        <Field label="Department name">
          <input name="name" required defaultValue={record?.name} className="field" />
        </Field>
        <Field label="Code">
          <input name="code" defaultValue={record?.code ?? ""} className="field" placeholder="OPS" />
        </Field>
      </Row>
      <Field label="Department head">
        <Select name="head_id" defaultValue={record?.head_id ?? ""} className="field">
          <option value="">Not appointed</option>
          {heads.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitBtn className="w-full">{record ? "Save department" : "Add department"}</SubmitBtn>
    </ActionForm>
  );
}

export function LeaveTypeForm({ record }: { record?: any }) {
  return (
    <ActionForm action={saveLeaveType} className="space-y-4">
      {record && <input type="hidden" name="id" value={record.id} />}
      <Field label="Leave type">
        <input name="name" required defaultValue={record?.name} className="field" placeholder="e.g. Annual Leave" />
      </Field>
      <Row>
        <Field label="Days per year">
          <input name="default_days" type="number" min="0" max="365" required defaultValue={record?.default_days ?? 0} className="field tabular" />
        </Field>
        <Field label="Colour">
          <input name="color" type="color" defaultValue={record?.color ?? "#6366f1"} className="field h-10 p-1" />
        </Field>
      </Row>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-canvas p-3">
        <input type="checkbox" name="paid" defaultChecked={record ? record.paid : true} className="h-4 w-4 accent-brand-600" />
        <span className="text-sm font-bold">Paid leave — counts towards the paid-leave dashboard figure</span>
      </label>
      <SubmitBtn className="w-full">{record ? "Save leave type" : "Add leave type"}</SubmitBtn>
    </ActionForm>
  );
}

export function BalanceForm({
  user,
  types,
  balances,
}: {
  user: { id: number; full_name: string };
  types: { id: number; name: string }[];
  balances: { leave_type_id: number; entitled: string; used: string }[];
}) {
  const year = new Date().getFullYear();
  return (
    <div className="space-y-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] font-bold tracking-wider text-ink-soft uppercase">
            <th className="pb-2">Type</th>
            <th className="pb-2 text-right">Entitled</th>
            <th className="pb-2 text-right">Used</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {types.map((t) => {
            const b = balances.find((x) => x.leave_type_id === t.id);
            return (
              <tr key={t.id}>
                <td className="py-2 font-semibold">{t.name}</td>
                <td className="py-2 text-right font-bold tabular">{Number(b?.entitled ?? 0)}</td>
                <td className="py-2 text-right font-bold tabular">{Number(b?.used ?? 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ActionForm action={adjustBalance} className="space-y-4 border-t border-line pt-4">
        <input type="hidden" name="user_id" value={user.id} />
        <input type="hidden" name="year" value={year} />
        <Row>
          <Field label="Leave type">
            <select name="leave_type_id" required className="field">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Entitlement for ${year}`}>
            <input name="entitled" type="number" min="0" step="0.5" required className="field tabular" />
          </Field>
        </Row>
        <SubmitBtn className="w-full">Set entitlement</SubmitBtn>
      </ActionForm>
    </div>
  );
}
