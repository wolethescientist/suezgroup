"use client";

import { useState } from "react";
import { Avatar } from "./ui";

/** Small avatars are encoded client-side, then stored through the existing attachment path. */
export function ImagePicker({
  name, current, fallbackName, hint = "PNG, JPG, or WebP — up to 3 MB.",
}: { name: string; current: string | null; fallbackName: string; hint?: string }) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState("");
  return <div className="flex items-center gap-4">
    <input type="hidden" name={name} value={value} />
    <Avatar name={fallbackName} src={value || null} size="xl" />
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-xl bg-brand-50 px-3.5 py-2 text-sm font-bold text-brand-700 hover:bg-brand-100">
          Choose image
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 3_000_000) { setError("That image is larger than 3 MB."); return; }
            const reader = new FileReader();
            reader.onload = () => { setValue(String(reader.result)); setError(""); };
            reader.readAsDataURL(file);
          }} />
        </label>
        {value && <button type="button" onClick={() => setValue("")} className="rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:bg-canvas">Remove</button>}
      </div>
      <p className={`mt-1.5 text-xs font-medium ${error ? "text-rose-600" : "text-ink-soft"}`}>{error || hint}</p>
    </div>
  </div>;
}
