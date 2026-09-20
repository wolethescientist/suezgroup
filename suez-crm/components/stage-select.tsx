"use client";

import { useTransition } from "react";
import type { Action } from "@/components/form";

/**
 * Change the stage from the board — no drag-and-drop library involved.
 *
 * ponytail: the stage list used to be a hardcoded array here, and in three other
 * files. It comes from crm_stages now, passed in by the page, so a company that
 * changes its sales process changes it in one place.
 */
export function StageSelect({
  action, id, stage, stages,
}: {
  action: Action;
  id: number;
  stage: string;
  stages: { key: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      value={stage}
      disabled={pending}
      aria-label="Move to stage"
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", String(id));
        fd.set("stage", e.target.value);
        start(() => {
          action(fd);
        });
      }}
      className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-soft disabled:opacity-50"
    >
      {stages.map((s) => (
        <option key={s.key} value={s.key}>
          Move to {s.label}
        </option>
      ))}
    </select>
  );
}
