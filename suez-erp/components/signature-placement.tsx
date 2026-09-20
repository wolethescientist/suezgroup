"use client";

import { useRef, useState } from "react";
import { ActionForm, SubmitBtn, type Action } from "@/components/form";

type Placement = { x: number; y: number };

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

/**
 * A print-safe signature footer with a direct-manipulation preview.  The
 * coordinates describe the signature's top-left corner within this reserved
 * document area, avoiding a signature accidentally covering body text.
 */
export function SignaturePlacement({
  memoId,
  signature,
  author,
  title,
  placement,
  editable,
  action,
  placementNote = "Drag it in the preview below, or append it at the bottom left. Save the position before publishing; published documents are locked.",
  saveLabel = "Save signature position",
}: {
  memoId: number;
  signature: string | null;
  author: string;
  title: string | null;
  placement: Partial<Placement> | null;
  editable: boolean;
  action: Action;
  placementNote?: string;
  saveLabel?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Placement>({
    x: clamp(Number(placement?.x ?? 4), 64),
    y: clamp(Number(placement?.y ?? 18), 55),
  });

  const move = (clientX: number, clientY: number) => {
    const rect = panel.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      x: clamp(((clientX - rect.left - 8) / rect.width) * 100, 64),
      y: clamp(((clientY - rect.top - 8) / rect.height) * 100, 55),
    });
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !signature) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    move(event.clientX, event.clientY);
  };

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    move(event.clientX, event.clientY);
  };

  const signatureBlock = signature ? (
    <div
      className={`absolute w-56 select-none ${editable ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      onPointerDown={beginDrag}
      onPointerMove={drag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={signature} alt={`${author} signature`} data-signature className="h-16 max-w-full object-contain object-left p-1" />
      <div className="mt-1 border-t border-ink pt-1">
        <p className="text-sm font-bold">{author}</p>
        <p className="text-xs font-medium text-ink-soft">{title ?? "Staff"}</p>
      </div>
    </div>
  ) : (
    <div className="absolute left-2 top-5 w-64 border-t border-dashed border-ink/40 pt-2 text-xs font-medium text-ink-soft">
      No saved signature. Add one in Settings → Signature, then return here to place it.
    </div>
  );

  return (
    <section className="mt-10 print:break-inside-avoid">
      {editable && (
        <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 p-3 print:hidden">
          <p className="text-sm font-bold text-brand-900">Place your signature</p>
          <p className="mt-0.5 text-xs font-medium text-brand-800">{placementNote}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPosition({ x: 4, y: 18 })} className="rounded-lg bg-surface px-3 py-1.5 text-xs font-bold text-brand-800 ring-1 ring-brand-200 ring-inset">
              Append bottom left
            </button>
            <button type="button" onClick={() => setPosition({ x: 32, y: 18 })} className="rounded-lg bg-surface px-3 py-1.5 text-xs font-bold text-brand-800 ring-1 ring-brand-200 ring-inset">
              Bottom centre
            </button>
            <button type="button" onClick={() => setPosition({ x: 62, y: 18 })} className="rounded-lg bg-surface px-3 py-1.5 text-xs font-bold text-brand-800 ring-1 ring-brand-200 ring-inset">
              Bottom right
            </button>
          </div>
        </div>
      )}

      <div ref={panel} className={`relative min-h-52 border-t border-line ${editable ? "rounded-xl bg-canvas/40 outline outline-1 outline-brand-100" : ""}`}>
        {signatureBlock}
      </div>

      {editable && signature && (
        <ActionForm action={action} className="mt-3 flex justify-end print:hidden">
          <input type="hidden" name="id" value={memoId} />
          <input type="hidden" name="signature_x" value={position.x} />
          <input type="hidden" name="signature_y" value={position.y} />
          <SubmitBtn variant="outline">{saveLabel}</SubmitBtn>
        </ActionForm>
      )}
    </section>
  );
}
