import { requireUser } from "@/lib/auth";
import { updateProfile } from "@/lib/actions/auth";
import { ActionForm, SubmitBtn } from "@/components/form";
import { ImagePicker } from "@/components/image-picker";
import { Card, CardTitle, Field, Row } from "@/components/ui";
import { titleCase } from "@/lib/format";

export default async function ProfileSettings() {
  const me = await requireUser();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle>My profile</CardTitle>
        <ActionForm action={updateProfile} className="space-y-5">
          <ImagePicker name="avatar_url" current={me.avatar_url} fallbackName={me.full_name} hint="Square photos look best. Up to 3 MB." />
          <Row>
            <Field label="Full name">
              <input name="full_name" required defaultValue={me.full_name} className="field" />
            </Field>
            <Field label="Job title">
              <input name="job_title" defaultValue={me.job_title ?? ""} className="field" />
            </Field>
          </Row>
          <Row>
            <Field label="Phone">
              <input name="phone" defaultValue={me.phone ?? ""} className="field" />
            </Field>
            <Field label="Work email" hint="Only HR can change your work email.">
              <input value={me.email} disabled className="field" />
            </Field>
          </Row>
          <SubmitBtn>Save profile</SubmitBtn>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle>Employment</CardTitle>
        <dl className="space-y-3 text-sm">
          {[
            ["Staff number", me.staff_no ?? "—"],
            ["Department", me.department ?? "—"],
            ["Access level", titleCase(me.role)],
            ["Signature", me.signature ? "On file" : "Not set"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="font-medium text-ink-soft">{k}</dt>
              <dd className="text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 rounded-xl bg-canvas p-3 text-xs font-medium text-ink-soft">
          Staff number, department and access level are maintained by HR.
        </p>
      </Card>
    </div>
  );
}
