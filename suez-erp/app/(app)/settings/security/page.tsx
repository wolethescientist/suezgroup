import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { changePassword } from "@/lib/actions/auth";
import { auditLabel, fmtDateTime } from "@/lib/format";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Card, CardTitle, Field } from "@/components/ui";

export default async function SecuritySettings({ searchParams }: { searchParams: Promise<{ first_login?: string }> }) {
  const me = await requireUser();
  const { first_login } = await searchParams;
  const events = await sql<{ id: number; action: string; created_at: string; entity: string | null }>`
    select id, action, entity, created_at from audit_log where user_id = ${me.id} order by created_at desc limit 12`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle>Change password</CardTitle>
        {first_login && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Your account has a temporary password. Choose a new one now; you will be signed out afterwards and must sign in with it.</p>}
        <ActionForm action={changePassword} reset className="max-w-md space-y-4">
          <Field label="Current password">
            <input name="current_password" type="password" required autoComplete="current-password" className="field" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input name="new_password" type="password" required minLength={8} autoComplete="new-password" className="field" />
          </Field>
          <Field label="Confirm new password">
            <input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" className="field" />
          </Field>
          <SubmitBtn>Update password</SubmitBtn>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle>Recent account activity</CardTitle>
        {events.length === 0 ? (
          <p className="text-sm font-medium text-ink-soft">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 text-sm">
                <span className="font-semibold">{auditLabel(e.action)}</span>
                <span className="shrink-0 text-xs font-medium text-ink-soft">{fmtDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
