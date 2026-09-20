"use client";

import { useState } from "react";
import { saveRole } from "@/lib/actions/admin";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Field, Row } from "@/components/ui";
import { CAPABILITIES, CAPABILITY_GROUPS, capabilitiesIn } from "@/lib/capabilities";

/**
 * Create a role, or change what one can do.
 *
 * The capability list comes from lib/capabilities.ts rather than the database,
 * because the code is what checks it — a capability nobody calls `can()` for
 * would be a promise this screen could not keep.
 */
export function RoleForm({
  record,
}: {
  record?: { key: string; name: string; description: string | null; is_builtin: boolean; capabilities: string[] };
}) {
  const [held, setHeld] = useState<string[]>(record?.capabilities ?? []);
  const toggle = (key: string) =>
    setHeld((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));

  const groupState = (group: string) => {
    const keys = capabilitiesIn(group).map((c) => c.key);
    const on = keys.filter((k) => held.includes(k)).length;
    return on === 0 ? "none" : on === keys.length ? "all" : "some";
  };
  const toggleGroup = (group: string) => {
    const keys = capabilitiesIn(group).map((c) => c.key);
    setHeld((h) => (groupState(group) === "all" ? h.filter((k) => !keys.includes(k)) : [...new Set([...h, ...keys])]));
  };

  return (
    <ActionForm action={saveRole} className="space-y-5">
      {record && <input type="hidden" name="key" value={record.key} />}

      <Row>
        <Field label="Name">
          <input name="name" required defaultValue={record?.name} className="field"
                 placeholder="e.g. Warehouse Supervisor" readOnly={record?.is_builtin} />
        </Field>
        {!record && (
          <Field label="Key" hint="Lowercase, no spaces. Stored on the employee record and cannot change later.">
            <input name="key" required className="field font-mono" placeholder="warehouse_supervisor" />
          </Field>
        )}
      </Row>

      <Field label="Description" hint="What this role is for, in a line. Shown on the Employees screen.">
        <input name="description" defaultValue={record?.description ?? ""} className="field" />
      </Field>

      {record?.is_builtin && (
        <p className="rounded-xl bg-canvas px-3 py-2 text-xs font-semibold text-ink-soft">
          This is a built-in role, so its name and key are fixed. You can still change exactly what it can do.
        </p>
      )}

      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-bold tracking-wider text-ink-soft uppercase">What this role can do</p>
          <p className="text-xs font-semibold text-ink-soft">
            {held.length} of {CAPABILITIES.length} selected
          </p>
        </div>

        {CAPABILITY_GROUPS.map((group) => {
          const state = groupState(group);
          return (
            <div key={group} className="rounded-2xl border border-line">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                <span className="text-sm font-bold">{group}</span>
                <button type="button" onClick={() => toggleGroup(group)}
                        className="rounded-lg px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50">
                  {state === "all" ? "Clear all" : "Select all"}
                </button>
              </div>
              <ul className="divide-y divide-line">
                {capabilitiesIn(group).map((c) => (
                  <li key={c.key}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-canvas">
                      <input type="checkbox" name="capability" value={c.key}
                             checked={held.includes(c.key)} onChange={() => toggle(c.key)}
                             className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{c.label}</span>
                        <span className="block text-xs font-medium text-ink-soft">{c.hint}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <SubmitBtn className="w-full">{record ? "Save role" : "Create role"}</SubmitBtn>
    </ActionForm>
  );
}
