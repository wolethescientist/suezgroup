import { requireCap } from "@/lib/auth";
import { getOrg, getSigningSettings } from "@/lib/settings";
import { saveOrganisation, saveSigningPolicy } from "@/lib/actions/admin";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Card, CardTitle, Field, Row } from "@/components/ui";

export default async function OrganisationSettings() {
  await requireCap("settings.organisation");
  const [org, signing] = await Promise.all([getOrg(), getSigningSettings()]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle>Organisation profile</CardTitle>
        <ActionForm action={saveOrganisation} className="space-y-4">
          <Row>
            <Field label="Registered name">
              <input name="name" required defaultValue={org.name} className="field" />
            </Field>
            <Field label="Short name" hint="Shown in the sidebar and emails.">
              <input name="short_name" defaultValue={org.short_name} className="field" />
            </Field>
          </Row>
          <Field label="Head office address">
            <input name="address" defaultValue={org.address} className="field" />
          </Field>
          <Row>
            <Field label="Switchboard">
              <input name="phone" defaultValue={org.phone} className="field" />
            </Field>
            <Field label="General email">
              <input name="email" type="email" defaultValue={org.email} className="field" />
            </Field>
          </Row>
          <Row>
            <Field label="Website">
              <input name="website" defaultValue={org.website} className="field" />
            </Field>
            <Field label="Timezone">
              <input name="timezone" defaultValue={org.timezone} className="field" placeholder="Africa/Lagos" />
            </Field>
          </Row>
          <Row>
            <Field label="Reporting currency" hint="ISO code, e.g. NGN, USD, GBP.">
              <input name="currency" defaultValue={org.currency} maxLength={3} className="field uppercase" />
            </Field>
            <Field label="Financial year starts" hint="MM-DD">
              <input name="fiscal_year_start" defaultValue={org.fiscal_year_start} className="field" placeholder="01-01" />
            </Field>
          </Row>
          <SubmitBtn>Save organisation</SubmitBtn>
        </ActionForm>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardTitle>Acknowledgement policy</CardTitle>
          <ActionForm action={saveSigningPolicy} className="space-y-4">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-canvas p-3">
              <input
                type="checkbox"
                name="require_password"
                defaultChecked={signing.require_password}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-bold">Require password confirmation to sign</span>
                <span className="block text-xs font-medium text-ink-soft">
                  Recipients re-enter their account password when acknowledging a document that requires a signature.
                </span>
              </span>
            </label>
            <p className="text-xs font-medium text-ink-soft">
              Turning this off means a signature only evidences an authenticated session, not a fresh act of consent.
              Each signature records which applied at the time, so changing this never rewrites past records — the
              signature register reports both.
            </p>
            <SubmitBtn>Save policy</SubmitBtn>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Notes</CardTitle>
          <p className="text-sm font-medium text-ink-soft">
            These details appear in the sidebar, on the sign-in screen and in the footer of every notification email.
          </p>
          <p className="mt-3 text-sm font-medium text-ink-soft">
            The reporting currency is used to format finance and operations values across the portal.
          </p>
        </Card>
      </div>
    </div>
  );
}
