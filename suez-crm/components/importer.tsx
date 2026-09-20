"use client";

import { useState } from "react";
import { SubmitBtn } from "./form";
import type { Dataset } from "../lib/import-defs";

type Preview = {
  filename: string;
  headers: string[];
  rows: string[][];
  total: number;
  map: Record<string, number>;
};

type Res = { ok?: boolean; error?: string; message?: string; preview?: Preview };

/**
 * Two-step spreadsheet import.
 *
 * Step one reads the file and shows what was found, with each column already
 * matched to a field where the header made that obvious. Nothing is written
 * until the user has seen that mapping and pressed Import — which matters,
 * because these files land straight in the customer and employee tables.
 *
 * The file input is kept mounted across both steps so the same File object is
 * posted again on commit; the server does not hold uploads between requests.
 */
export function SpreadsheetImporter({
  datasets,
  inspect,
  commit,
}: {
  datasets: Dataset[];
  inspect: (fd: FormData) => Promise<Res>;
  commit: (fd: FormData) => Promise<Res>;
}) {
  const [datasetKey, setDatasetKey] = useState(datasets[0]?.key ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dataset = datasets.find((d) => d.key === datasetKey);
  const needsPassword = datasetKey === "employees";

  async function run(fd: FormData, step: "inspect" | "commit") {
    setBusy(true);
    setError(null);
    try {
      if (step === "inspect") {
        const res = await inspect(fd);
        if (res.error) return setError(res.error);
        setPreview(res.preview!);
        setMap(res.preview!.map);
        setDone(null);
      } else {
        fd.set("map", JSON.stringify(map));
        const res = await commit(fd);
        if (res.error) return setError(res.error);
        setDone(res.message ?? "Imported.");
        setPreview(null);
      }
    } finally {
      setBusy(false);
    }
  }

  const unmapped = dataset?.fields.filter((f) => f.required && map[f.key] === undefined) ?? [];

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(fd, preview ? "commit" : "inspect");
      }}
    >
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset">{error}</p>
      )}
      {done && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">{done}</p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-ink-soft">What does the file contain?</span>
        <select
          name="dataset"
          value={datasetKey}
          onChange={(e) => {
            setDatasetKey(e.target.value);
            setPreview(null);
          }}
          className="field"
        >
          {datasets.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
        {dataset && <span className="mt-1 block text-xs font-medium text-ink-soft">{dataset.hint}</span>}
      </label>

      {/* Kept mounted so the same file is still attached when Import is pressed. */}
      <label className={`block ${preview ? "opacity-60" : ""}`}>
        <span className="mb-1.5 block text-xs font-bold text-ink-soft">Spreadsheet</span>
        <input name="file" type="file" accept=".xlsx,.xls,.csv" required className="field" onChange={() => setPreview(null)} />
        <span className="mt-1 block text-xs font-medium text-ink-soft">.xlsx or .csv, up to 10 MB and 5000 rows. The first row must be the column headings.</span>
      </label>

      {needsPassword && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink-soft">Temporary password for new employees</span>
          <input name="default_password" type="text" className="field" placeholder="e.g. Welcome2026!" />
          <span className="mt-1 block text-xs font-medium text-ink-soft">
            Only used for people not already on the system. Existing employees are updated and keep their password.
          </span>
        </label>
      )}

      {preview && dataset && (
        <>
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-sm font-bold">{preview.filename}</p>
            <p className="text-xs font-medium text-ink-soft">
              {preview.total} data row{preview.total === 1 ? "" : "s"} · {preview.headers.length} column{preview.headers.length === 1 ? "" : "s"}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-ink-soft">
              Column mapping — check these before importing
              {unmapped.length > 0 && <span className="ml-2 text-rose-700">Still needed: {unmapped.map((f) => f.label).join(", ")}</span>}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {dataset.fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-xs font-bold">
                    {f.label}
                    {f.required && <span className="text-rose-600"> *</span>}
                  </span>
                  <select
                    value={map[f.key] ?? ""}
                    onChange={(e) => {
                      const next = { ...map };
                      if (e.target.value === "") delete next[f.key];
                      else next[f.key] = Number(e.target.value);
                      setMap(next);
                    }}
                    className="field flex-1 !py-1.5 text-xs"
                  >
                    <option value="">— not imported —</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-ink-soft">First {preview.rows.length} rows as they will be read</p>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line">
                    {dataset.fields
                      .filter((f) => map[f.key] !== undefined)
                      .map((f) => (
                        <th key={f.key} className="px-3 py-2 font-bold tracking-wider text-ink-soft uppercase whitespace-nowrap">{f.label}</th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {dataset.fields
                        .filter((f) => map[f.key] !== undefined)
                        .map((f) => (
                          <td key={f.key} className="max-w-48 truncate px-3 py-2 font-medium">{row[map[f.key]] ?? ""}</td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || (!!preview && unmapped.length > 0)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-brand-600 disabled:opacity-50"
        >
          {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {preview ? `Import ${preview.total} row${preview.total === 1 ? "" : "s"}` : "Read the file"}
        </button>
        {preview && (
          <button type="button" onClick={() => setPreview(null)}
                  className="rounded-xl bg-canvas px-4 py-2.5 text-sm font-bold text-ink-soft hover:bg-line">
            Start over
          </button>
        )}
      </div>
    </form>
  );
}
