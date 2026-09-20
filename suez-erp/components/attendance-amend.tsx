"use client";

import { ActionForm, Dialog, SubmitBtn, type Action } from "@/components/form";
import { Field } from "@/components/ui";

/**
 * HR's correction to one attendance entry.
 *
 * The times go into `datetime-local` inputs, which want "YYYY-MM-DDTHH:MM" in
 * local time and reject anything else silently, so the stored timestamp is
 * converted rather than sliced.
 */
export function AmendAttendance({
  action,
  entry,
}: {
  action: Action;
  entry: { id: number; full_name: string; work_date: string; clocked_in_at: string; clocked_out_at: string | null };
}) {
  return (
    <Dialog
      label="Amend"
      variant="ghost"
      title={`Amend ${entry.full_name}'s attendance`}
      description="The reason is kept on the record and in the audit trail."
    >
      <ActionForm action={action} className="grid gap-4">
        <input type="hidden" name="id" value={entry.id} />

        <Field label="Clocked in">
          <input type="datetime-local" name="clocked_in_at" defaultValue={local(entry.clocked_in_at)} className="field" required />
        </Field>

        <Field label="Clocked out" hint="Leave blank to leave the session open.">
          <input type="datetime-local" name="clocked_out_at" defaultValue={local(entry.clocked_out_at)} className="field" />
        </Field>

        <Field label="Reason for the change">
          <input name="reason" className="field" required maxLength={200} placeholder="Forgot to clock out — confirmed with their manager." />
        </Field>

        <SubmitBtn>Save correction</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

function local(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
