import { requireUser } from "@/lib/auth";
import { updateProfile } from "@/lib/actions/auth";
import { ActionForm, SubmitBtn } from "@/components/form";
import { ImagePicker } from "@/components/image-picker";
import { Card, CardTitle, Field, PageHeader, Row } from "@/components/ui";
import { titleCase } from "@/lib/format";

export const metadata = { title: "My profile" };

export default async function SettingsPage() {
  const me = await requireUser();
  return <>
    <PageHeader title="My profile" subtitle="Manage your contact details and profile photo." />
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardTitle>Profile</CardTitle>
        <ActionForm action={updateProfile} className="space-y-5">
          <ImagePicker name="avatar_url" current={me.avatar_url} fallbackName={me.full_name} hint="Square PNG, JPG, or WebP images work best. Up to 3 MB." />
          <Row><Field label="Full name"><input name="full_name" required defaultValue={me.full_name} className="field" /></Field><Field label="Job title"><input name="job_title" defaultValue={me.job_title ?? ""} className="field" /></Field></Row>
          <Row><Field label="Phone"><input name="phone" defaultValue={me.phone ?? ""} className="field" /></Field><Field label="Work email" hint="An administrator manages your work email."><input value={me.email} disabled className="field" /></Field></Row>
          <SubmitBtn>Save profile</SubmitBtn>
        </ActionForm>
      </Card>
      <Card><CardTitle>Account</CardTitle><dl className="space-y-3 text-sm">
        {[["Department", me.department ?? "—"], ["Access level", titleCase(me.role)], ["Signature", me.signature ? "On file" : "Not set"]].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="font-medium text-ink-soft">{label}</dt><dd className="text-right font-bold">{value}</dd></div>)}
      </dl><p className="mt-4 rounded-xl bg-canvas p-3 text-xs font-medium text-ink-soft">Your administrator manages account access and work email.</p></Card>
    </div>
  </>;
}
