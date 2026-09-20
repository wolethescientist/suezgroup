"use client";

import { useState } from "react";

export type Line = { description: string; quantity: number | string; unit_price: number | string };

/**
 * Quote lines, added and removed client-side. Rows post as parallel
 * `line_desc`/`line_qty`/`line_price` arrays which the action zips back up.
 *
 * ponytail: this only ever started from one blank row, because nothing could
 * edit a quote once created. Editing one has to begin from the lines it already
 * has, or "correcting a typo" would mean re-keying the whole schedule.
 */
export function LineEditor({ lines = [] }: { lines?: Line[] }) {
  const initial = lines.length ? lines : [{ description: "", quantity: 1, unit_price: 0 }];
  // Rows are keyed by a stable id, not by index: removing the second of three
  // rows must not make React re-use the third row's DOM node for it, which is
  // how an uncontrolled input ends up showing the wrong line's text.
  const [rows, setRows] = useState(() => initial.map((l, i) => ({ key: i, ...l })));
  const [, bump] = useState(0);

  const total = () => {
    if (typeof document === "undefined") return 0;
    const qs = [...document.querySelectorAll<HTMLInputElement>('input[name="line_qty"]')];
    const ps = [...document.querySelectorAll<HTMLInputElement>('input[name="line_price"]')];
    return qs.reduce((s, q, i) => s + Number(q.value || 0) * Number(ps[i]?.value || 0), 0);
  };

  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs font-bold text-ink-soft">Lines</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-end gap-2">
            <input name="line_desc" defaultValue={r.description} placeholder="Description" className="field min-w-40 flex-1" />
            <input name="line_qty" type="number" step="0.01" min="0" defaultValue={String(r.quantity)}
                   onChange={() => bump((n) => n + 1)} className="field w-20" />
            <input name="line_price" type="number" step="0.01" min="0" defaultValue={String(r.unit_price)}
                   onChange={() => bump((n) => n + 1)} className="field w-28" />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                      className="rounded-lg px-2 py-2 text-ink-soft hover:bg-canvas" aria-label="Remove line">×</button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setRows([...rows, { key: Math.max(...rows.map((r) => r.key)) + 1, description: "", quantity: 1, unit_price: 0 }])
          }
          className="text-xs font-bold text-brand-700 hover:underline"
        >
          + Add line
        </button>
        <p className="tabular text-xs font-bold text-ink-soft">Subtotal {total().toLocaleString()}</p>
      </div>
    </div>
  );
}
