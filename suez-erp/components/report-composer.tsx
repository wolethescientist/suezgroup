"use client";

import { useState } from "react";
import { ActionForm, SubmitBtn, type Action } from "@/components/form";
import { Field } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";
import { periodLabel, type ReportKind } from "@/lib/periods";

/**
 * Writing a weekly or monthly report.
 *
 * The period is a dropdown of real periods rather than a date box, because
 * "week commencing" is a thing people get wrong and a report filed against the
 * wrong Monday is invisible to whoever is chasing it.
 */
export function ReportComposer({
  action,
  kind: initialKind,
  period: initialPeriod,
  periods,
  draft,
}: {
  action: Action;
  kind: ReportKind;
  period: string;
  periods: Record<ReportKind, string[]>;
  draft: { id: number; title: string; summary: string; body_html: string | null; status: string } | null;
}) {
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const [period, setPeriod] = useState(initialPeriod);

  // Switching weekly↔monthly makes the chosen period meaningless, so it resets
  // to the most recent period of the new kind rather than keeping a stale date.
  const changeKind = (next: ReportKind) => {
    setKind(next);
    setPeriod(periods[next][0]);
  };

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-3">
      <div className="card space-y-4 p-5 lg:col-span-2">
        <Field label="Title" hint="Left blank, it is named after the period.">
          <input
            name="title"
            defaultValue={draft?.title ?? ""}
            placeholder="e.g. Sales & Marketing — week in review"
            className="field"
          />
        </Field>

        <Field label="Headline" hint="One or two sentences. This is what shows in HR's list and in the email.">
          <textarea name="summary" rows={2} defaultValue={draft?.summary ?? ""} className="field" maxLength={400} />
        </Field>

        <Field label="The report" hint="Write it here, attach a document, or both.">
          <DocEditor
            name="body_html"
            defaultValue={draft?.body_html ?? ""}
            placeholder="What was done, what is outstanding, what needs a decision…"
            minHeight="18rem"
          />
        </Field>

        <Field label="Attachments" hint="PowerPoint, Word, PDF or Excel. You can choose several at once.">
          <input
            type="file"
            name="files"
            multiple
            accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,application/pdf"
            className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700"
          />
        </Field>
      </div>

      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <Field label="Report type">
            <select name="kind" value={kind} onChange={(e) => changeKind(e.target.value as ReportKind)} className="field">
              <option value="weekly">Weekly report</option>
              <option value="monthly">Monthly report</option>
            </select>
          </Field>

          <Field label={kind === "weekly" ? "Week reported on" : "Month reported on"}>
            <select name="period_start" value={period} onChange={(e) => setPeriod(e.target.value)} className="field">
              {periods[kind].map((p) => (
                <option key={p} value={p}>
                  {periodLabel(kind, p)}
                </option>
              ))}
            </select>
          </Field>

          {draft?.status === "returned" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset">
              This report was sent back. Re-submitting replaces what HR has.
            </p>
          )}
        </div>

        <div className="card flex flex-col gap-2 p-5">
          <SubmitBtn name="intent" value="submit">Send to HR</SubmitBtn>
          <SubmitBtn name="intent" value="draft" variant="outline">Save as draft</SubmitBtn>
          <p className="text-xs font-medium text-ink-soft">
            A draft is yours alone until you send it.
          </p>
        </div>
      </div>
    </ActionForm>
  );
}
