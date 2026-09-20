"use client";

import { useState } from "react";
import { ActionForm, SubmitBtn } from "@/components/form";
import { BTN, VARIANTS } from "@/components/button-styles";

/**
 * The grid and the header's submit button are one form.
 *
 * ponytail: they used to be two. "Submit for approval" posted only week_start,
 * so a week you had typed but not saved was submitted as empty — the hours went
 * nowhere and the failure was silent. The header button now targets this form
 * by id, so whatever is on screen is what gets saved and sent.
 */
export const WEEK_FORM_ID = "timesheet-week";

type Entry = { work_date: string; hours: string; project_id: number | null; task: string | null; billable: boolean };
type Opt = { id: number; label: string };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * One row per day of the week. Every day posts, including empty ones — the
 * action filters out zero-hour rows, which is what makes clearing a day work.
 */
export function TimesheetGrid({
  saveAction,
  weekStart,
  entries,
  projects,
  locked,
}: {
  saveAction: (fd: FormData) => Promise<any>;
  weekStart: string;
  entries: Entry[];
  projects: Opt[];
  locked: boolean;
}) {
  const initial = DAYS.map((_, i) => {
    const date = addDays(weekStart, i);
    const found = entries.find((e) => e.work_date.slice(0, 10) === date);
    return {
      date,
      hours: found ? String(Number(found.hours)) : "",
      project: found?.project_id ? String(found.project_id) : "",
      task: found?.task ?? "",
      billable: found?.billable ?? false,
    };
  });
  const [rows, setRows] = useState(initial);
  const total = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);

  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));

  return (
    <ActionForm action={saveAction} className="space-y-4" id={WEEK_FORM_ID}>
      <input type="hidden" name="week_start" value={weekStart} />
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {["Day", "Date", "Hours", "Project", "What you worked on", "Billable"].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-bold tracking-wider text-ink-soft uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => {
              const weekend = i >= 5;
              return (
                <tr key={r.date} className={weekend ? "bg-canvas/60" : ""}>
                  <td className="px-4 py-2 font-bold">{DAYS[i]}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-ink-soft tabular">{r.date}</td>
                  <td className="px-4 py-2">
                    <input type="hidden" name="entry_date" value={r.date} />
                    <input name="entry_hours" type="number" step="0.25" min="0" max="24" disabled={locked}
                           value={r.hours} onChange={(e) => set(i, { hours: e.target.value })}
                           className="field w-20 !py-1.5" placeholder="0" />
                  </td>
                  <td className="px-4 py-2">
                    <select name="entry_project" disabled={locked} value={r.project}
                            onChange={(e) => set(i, { project: e.target.value })} className="field w-40 !py-1.5">
                      <option value="">—</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input name="entry_task" disabled={locked} value={r.task}
                           onChange={(e) => set(i, { task: e.target.value })} className="field w-full !py-1.5" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="hidden" name="entry_billable" value={r.billable ? "true" : "false"} />
                    <input type="checkbox" disabled={locked} checked={r.billable}
                           onChange={(e) => set(i, { billable: e.target.checked })} className="h-4 w-4 rounded" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td colSpan={2} className="px-4 py-3 text-xs font-bold tracking-wider text-ink-soft uppercase">Total</td>
              <td className="px-4 py-3 font-bold tabular">{total.toFixed(2)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {!locked && (
        <div className="flex flex-wrap gap-2">
          <SubmitBtn variant="soft" name="intent" value="save">Save draft</SubmitBtn>
          <SubmitBtn name="intent" value="submit">Submit for approval</SubmitBtn>
        </div>
      )}
    </ActionForm>
  );
}

/**
 * Lives in the page header, above the grid, but submits the grid form via the
 * `form` attribute — so it saves the week and sends it in one go.
 */
export function SubmitWeek() {
  return (
    <button type="submit" form={WEEK_FORM_ID} name="intent" value="submit" className={`${BTN} ${VARIANTS.primary}`}>
      Submit for approval
    </button>
  );
}
