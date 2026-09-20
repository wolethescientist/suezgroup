"use client";

import { useTransition } from "react";
import type { Action } from "@/components/form";

/**
 * A <select> that submits a server action on change.
 *
 * A server component cannot hand an onChange down to the DOM, so anywhere a
 * list row needs "change this field inline" it goes through here.
 */
export function StatusSelect({
  action,
  id,
  value,
  options,
  field = "status",
  label = "Change status",
  className = "",
}: {
  action: Action;
  id: number;
  value: string;
  options: [string, string][];
  field?: string;
  label?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      disabled={pending}
      aria-label={label}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", String(id));
        fd.set(field, e.target.value);
        start(() => {
          action(fd);
        });
      }}
      className={`w-full rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-soft disabled:opacity-50 ${className}`}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
