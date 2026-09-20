"use client";

import { BTN, VARIANTS } from "./button-styles";

// ponytail: window.print() is the whole "export to PDF" feature — every browser's
// print dialog offers Save as PDF, so no renderer dependency ships.
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`${BTN} ${VARIANTS.primary}`}
    >
      {label}
    </button>
  );
}
