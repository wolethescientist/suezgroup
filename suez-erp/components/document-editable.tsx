"use client";

import { useState } from "react";
import { ActionForm, SubmitBtn, type Action } from "@/components/form";
import { Icon } from "@/components/icons";
import { DocEditor } from "@/components/doc-editor";

/**
 * The document, and the same document being edited — in the same place.
 *
 * ponytail: reviewing a document meant reading it on one page and having no way
 * to change it on any page, because nothing could edit a memo once composed.
 *
 * Edit mode deliberately does not move you anywhere or change the layout: the
 * letterhead, the reference block and the signature stay exactly where they
 * are, and only the subject line and the body become live. What you are editing
 * is the document as it will be issued, not a form that describes it.
 */
export function DocumentEditable({
  action,
  id,
  title,
  bodyHtml,
  bodyText,
  status,
  version,
  requiresAck,
  canEdit,
  /** Reference-block rows rendered above the subject line. */
  meta,
  children,
}: {
  action: Action;
  id: number;
  title: string;
  /** Already sanitised server-side; sanitised again there on every read. */
  bodyHtml: string;
  /** The plain-text body, for documents composed before formatting existed. */
  bodyText: string;
  status: string;
  version: number;
  requiresAck: boolean;
  canEdit: boolean;
  meta: [string, string][];
  /** Rendered under the body in read mode — attachment line, signature block. */
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const published = status === "published";

  const Rows = ({ subject }: { subject: React.ReactNode }) => (
    <dl className="mt-6 space-y-1.5 border-y border-line py-4 text-sm">
      {meta.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <dt className="w-20 shrink-0 text-[11px] font-bold tracking-wider text-ink-soft uppercase">{k}</dt>
          <dd className="flex-1 font-semibold">{v}</dd>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <dt className="w-20 shrink-0 text-[11px] font-bold tracking-wider text-ink-soft uppercase">Subject</dt>
        <dd className="flex-1 font-semibold">{subject}</dd>
      </div>
    </dl>
  );

  /* ------------------------------------------------------------ read mode */
  if (!editing) {
    return (
      <>
        {canEdit && (
          <div className="mt-4 flex justify-end print:hidden">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-brand-300 hover:text-brand-800"
            >
              <Icon name="pen" className="h-3.5 w-3.5" />
              {published ? "Edit — issues a new version" : "Edit document"}
            </button>
          </div>
        )}
        <Rows subject={title} />
        <Body html={bodyHtml} text={bodyText} />
        {children}
      </>
    );
  }

  /* ------------------------------------------------------------ edit mode */
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 ring-1 ring-brand-200 ring-inset print:hidden">
        <p className="text-xs font-bold text-brand-800">
          {published ? `Editing — saving issues version ${version + 1}` : "Editing draft"}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-surface"
          >
            Cancel
          </button>
          <SubmitBtn className="!px-3 !py-1.5 !text-xs">{published ? "Issue revision" : "Save draft"}</SubmitBtn>
        </div>
      </div>

      <Rows
        subject={
          <input
            name="title"
            defaultValue={title}
            required
            aria-label="Subject"
            className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm font-semibold outline-none focus:border-brand-400"
          />
        }
      />

      <div className="mt-6">
        <DocEditor name="body_html" defaultValue={bodyHtml || textToHtml(bodyText)} bare minHeight="18rem" />
      </div>

      {published && (
        <div className="mt-6 space-y-3 rounded-xl bg-canvas p-4 print:hidden">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold tracking-wider text-ink-soft uppercase">
              What changed
            </span>
            <input
              name="note"
              placeholder="e.g. Corrected the claim deadline in clause 3"
              className="field !bg-surface"
            />
            <span className="mt-1 block text-xs font-medium text-ink-soft">
              Recorded against version {version + 1} in the revision history.
            </span>
          </label>

          {requiresAck && (
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" name="re_acknowledge" className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span>
                <span className="block text-sm font-bold">Ask everyone to sign again</span>
                <span className="block text-xs font-medium text-ink-soft">
                  Clears the current signatures and asks every recipient to read and sign version {version + 1}.
                  Signatures already given are kept in the register against the version they were given for, whether
                  or not you tick this.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:bg-canvas"
        >
          Cancel
        </button>
        <SubmitBtn>{published ? `Issue version ${version + 1}` : "Save draft"}</SubmitBtn>
      </div>
    </ActionForm>
  );
}

/** Formatted body when there is one, and the old plain text when there is not. */
function Body({ html, text }: { html: string; text: string }) {
  if (html) return <div className="doc-body mt-6 text-[15px] font-medium" dangerouslySetInnerHTML={{ __html: html }} />;
  return <div className="mt-6 text-[15px] font-medium whitespace-pre-wrap">{text}</div>;
}

/**
 * Documents written before the editor existed are plain text. Turning their
 * line breaks into paragraphs on the way in means editing one does not silently
 * collapse it into a single block.
 */
function textToHtml(text: string) {
  if (!text) return "";
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split("\n").map(escape).join("<br>")}</p>`)
    .join("");
}
