import { resetUserPassword, saveUser } from "@/lib/actions/admin";
import { ActionForm, Select, SubmitBtn } from "@/components/form";
import { Field, Row } from "@/components/ui";

type Opt = { id: number; name: string };

/**
 * ponytail: the CRM had no way to add a person or change their access — it read
 * the users table everywhere and offered no screen to write to it.
 */
export function UserForm({
  managers,
  roles,
  record,
  canGrantAdmin,
}: {
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
          <input name="job_title" defaultValue={record?.job_title ?? ""} className="field" placeholder="Account Executive" />
        </Field>
        <Field label="Reports to">
          <Select name="manager_id" defaultValue={record?.manager_id ?? ""} className="field">
            <option value="">Nobody</option>
            {managers
              .filter((m) => m.id !== record?.id)
              .map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
          </Select>
        </Field>
      </Row>
      <Field label="Access level" hint="What each role can do is set under Roles & Access.">
        <Select name="role" defaultValue={record?.role ?? "staff"} className="field">
          {roles
            // Only somebody who manages roles hands out a role that manages roles.
            .filter((r) => canGrantAdmin || r.key !== "admin")
            .map((r) => (
              <option key={r.key} value={r.key}>
                {r.description ? `${r.name} — ${r.description}` : r.name}
              </option>
            ))}
        </Select>
      </Field>
      {record ? (
        <Field label="Account status">
          <Select name="status" defaultValue={record.status} className="field">
            <option value="active">Active</option>
            <option value="suspended">Suspended — cannot sign in</option>
          </Select>
        </Field>
      ) : (
        <Field label="Starting password" hint="Minimum 8 characters. They can change it after signing in.">
          <input name="password" type="password" className="field" defaultValue="Welcome123!" />
        </Field>
      )}
      <SubmitBtn className="w-full">{record ? "Save user" : "Add user"}</SubmitBtn>
    </ActionForm>
  );
}

export function ResetPasswordForm({ user }: { user: { id: number; full_name: string } }) {
  return (
    <ActionForm action={resetUserPassword} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <p className="text-sm font-medium text-ink-soft">
        Set a temporary password for {user.full_name} and share it securely.
      </p>
      <Field label="New password" hint="Minimum 8 characters.">
        <input name="password" type="password" required minLength={8} className="field" defaultValue="Welcome123!" />
      </Field>
      <SubmitBtn variant="danger" className="w-full">Reset password</SubmitBtn>
    </ActionForm>
  );
}
