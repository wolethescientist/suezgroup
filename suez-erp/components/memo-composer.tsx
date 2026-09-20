"use client";

import { useState } from "react";
import { ActionForm, Select, SubmitBtn, type Action } from "@/components/form";
import { Field } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";

export function MemoComposer({
  action,
  departments,
  people,
  canIssueFormal,
  canPublish,
}: {
  action: Action;
  departments: { id: number; name: string }[];
  people: { id: number; full_name: string; department: string | null }[];
  /** HR/administrators: may issue policies, address everyone, and demand signatures. */
  canIssueFormal: boolean;
  /** Line managers and above. Everyone else can draft and hand it up. */
  canPublish: boolean;
}) {
  // Staff are not offered "Everyone", so the default must be one they can pick.
  const [audience, setAudience] = useState(canIssueFormal ? "all" : "department");
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-3">
      <div className="card space-y-4 p-5 lg:col-span-2">
        <Field label="Title">
          <input name="title" required placeholder="e.g. Revised expense claim procedure" className="field" />
        </Field>
        <Field label="Body" hint="Formatting, headings and lists are kept exactly as you see them here.">
          <DocEditor name="body_html" placeholder="Write the memo…" />
        </Field>
        <Field label="Attachment" hint="Optional — PDF, image or document up to 20 MB.">
          <input type="file" name="attachment" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" />
        </Field>
      </div>

      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <Field label="Type">
            <Select name="kind" className="field" defaultValue="memo">
              <option value="memo">Memo</option>
              <option value="circular">Circular</option>
              {canIssueFormal && <option value="policy">Policy</option>}
            </Select>
          </Field>
          <Field label="Priority">
            <Select name="priority" className="field" defaultValue="normal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field label="Audience">
            <select name="audience" className="field" value={audience} onChange={(e) => setAudience(e.target.value)}>
              {canIssueFormal && <option value="all">Everyone</option>}
              <option value="department">A department</option>
              <option value="selected">Selected people</option>
            </select>
          </Field>

          {audience === "department" && (
            <Field label="Department">
              <select name="department_id" className="field" required>
                <option value="">Choose…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {audience === "selected" && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-soft">
                Recipients {picked.length > 0 && <span className="text-brand-700">({picked.length} selected)</span>}
              </p>
              <div className="max-h-60 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
                {people.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-canvas"
                  >
                    <input
                      type="checkbox"
                      name="recipients"
                      value={p.id}
                      checked={picked.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
                    <span className="shrink-0 text-[11px] font-medium text-ink-soft">{p.department ?? "—"}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {canIssueFormal && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-canvas p-3">
              <input type="checkbox" name="requires_ack" className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span>
                <span className="block text-sm font-bold">Require acknowledgement</span>
                <span className="block text-xs font-medium text-ink-soft">
                  Recipients must sign with their stored signature.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="card flex flex-col gap-2 p-5">
          {canPublish && (
            <SubmitBtn name="intent" value="publish">
              Publish now
            </SubmitBtn>
          )}
          <SubmitBtn name="intent" value="draft" variant={canPublish ? "outline" : "primary"}>
            Save draft & preview
          </SubmitBtn>
          {!canPublish && (
            <p className="text-xs font-medium text-ink-soft">
              Drafts are visible to HR and your department head, who can issue them.
            </p>
          )}
        </div>
      </div>
    </ActionForm>
  );
}
