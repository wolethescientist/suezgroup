import { requireUser } from "@/lib/auth";
import { clearSignature, saveSignature } from "@/lib/actions/auth";
import { ActionForm, ConfirmBtn, SubmitBtn } from "@/components/form";
import { SignaturePad } from "@/components/signature-pad";
import { Card, CardTitle } from "@/components/ui";

export default async function SignatureSettings() {
  const me = await requireUser();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle>My signature</CardTitle>
        <SignaturePad action={saveSignature} existing={me.signature} />
      </Card>

      <div className="space-y-6">
        <Card>
          <CardTitle>Where it is used</CardTitle>
          <ul className="space-y-2.5 text-sm font-medium">
            {[
              "Acknowledging circulars and policies that require a signature",
              "Memos and circulars you publish yourself",
              "Approvals recorded against leave and workflow requests",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-canvas p-3 text-xs font-medium text-ink-soft">
            Your signature is stored against your staff record and only shown inside the portal.
          </p>
        </Card>

        {me.signature && (
          <Card>
            <CardTitle>Remove</CardTitle>
            <ActionForm action={clearSignature}>
              <p className="mb-3 text-sm font-medium text-ink-soft">
                Deleting your signature means you will not be able to acknowledge documents until you add a new one.
              </p>
              <ConfirmBtn
                variant="danger"
                className="w-full"
                title="Delete your signature?"
                body="You will not be able to acknowledge documents until you add a new one. Signatures already recorded on past documents are unaffected."
                confirmLabel="Delete signature"
              >
                Delete my signature
              </ConfirmBtn>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
