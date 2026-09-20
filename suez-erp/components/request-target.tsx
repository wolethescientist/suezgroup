"use client";

import { useState } from "react";
import { Select } from "@/components/form";
import { Field } from "@/components/ui";

/**
 * Who a request is aimed at: a named colleague, or a department queue.
 *
 * The queue is offered first when the person can use it, because it is the
 * answer to the problem — somebody on the support line does not know which
 * person in IT to ask, and walking over to find out is the thing being
 * replaced.
 */
export function RequestTarget({
  people,
  departments,
  canQueue,
  defaultAssignee,
}: {
  people: { id: number; full_name: string; job_title: string | null; department: string | null }[];
  departments: { id: number; name: string; staff: number }[];
  canQueue: boolean;
  defaultAssignee?: string;
}) {
  const [target, setTarget] = useState(canQueue && !defaultAssignee ? "department" : "person");

  return (
    <>
      <Field label="Send it to">
        <select
          name="target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="field"
          disabled={!canQueue}
        >
          {canQueue && <option value="department">A department — whoever is free</option>}
          <option value="person">A named colleague</option>
        </select>
        {canQueue && (
          <p className="mt-1 text-[11px] font-medium text-ink-soft">
            {target === "department"
              ? "It sits in that department's queue until somebody picks it up. Nobody has to be walked over to."
              : "Goes straight onto that person's desk."}
          </p>
        )}
      </Field>

      {target === "department" ? (
        <Field label="Department">
          <Select name="department_id" required className="field" defaultValue="">
            <option value="">Choose a department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.staff})
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Assign to">
          <Select name="assignee_id" required className="field" defaultValue={defaultAssignee ?? ""}>
            <option value="">Choose a colleague…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} — {p.job_title ?? p.department ?? "Staff"}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </>
  );
}
