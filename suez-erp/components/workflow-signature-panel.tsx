"use client";

import { useRef, useState } from "react";
import { ActionForm, SubmitBtn, type Action } from "@/components/form";

type Placement = { x?: number; y?: number } | null;
type Signed = { id: number; name: string; title: string | null; signature: string; placement: Placement; final: boolean };
type Current = { id: number; name: string; title: string | null; signature: string | null; placement: Placement; final: boolean };

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

/**
 * A shared printable canvas for a request's approval signatures. Earlier
 * signatures are immutable snapshots; only the current approver's own stamp
 * can be dragged. Each stamp is deliberately independent so a director can
 * sign wherever the document convention requires without moving somebody else.
 */
export function WorkflowSignaturePanel({
  requestId,
  signed,
  current,
  action,
}: {
  requestId: number;
  signed: Signed[];
  current: Current | null;
  action: Action;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    x: clamp(Number(current?.placement?.x ?? 4), 64),
    y: clamp(Number(current?.placement?.y ?? 18), 55),
  });

  const move = (clientX: number, clientY: number) => {
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({
      x: clamp(((clientX - box.left - 8) / box.width) * 100, 64),
      y: clamp(((clientY - box.top - 8) / box.height) * 100, 55),
    });
  };

  const signedStamp = (entry: Signed, key: string) => (
    <div key={key} className="pointer-events-none absolute w-56" style={{ left: `${clamp(Number(entry.placement?.x ?? 4), 64)}%`, top: `${clamp(Number(entry.placement?.y ?? 18), 55)}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={entry.signature} alt={`${entry.name} signature`} data-signature className="h-16 max-w-full object-contain object-left p-1" />
      <div className="mt-1 border-t border-ink pt-1">
        <p className="text-sm font-bold">{entry.name}{entry.final ? " · final sign-off" : ""}</p>
        <p className="text-xs font-medium text-ink-soft">{entry.title ?? "Staff"}</p>
      </div>
    </div>
  );

  return (
    <section className="mt-10 print:break-inside-avoid">
      <div className="mb-3 print:hidden">
        <h2 className="text-xs font-bold tracking-wider text-ink-soft uppercase">Approval signatures</h2>
        {current?.signature ? (
          <p className="mt-1 text-sm font-medium text-ink-soft">
            Drag your signature into position, or append it at the bottom. Save its position, then approve and sign.
          </p>
        ) : current ? (
          <a href="/settings/signature" className="mt-2 inline-block rounded-xl bg-brand-50 px-3 py-2 text-sm font-bold text-brand-800 ring-1 ring-brand-200 ring-inset">
            Add your signature before signing this request →
          </a>
        ) : (
          <p className="mt-1 text-sm font-medium text-ink-soft">Signed approvals are captured here as each step is completed.</p>
        )}
      </div>

      <div ref={panel} className={`relative min-h-64 border-t border-line ${current?.signature ? "rounded-xl bg-canvas/40 outline outline-1 outline-brand-100 print:bg-transparent print:outline-0" : ""}`}>
        {signed.map((entry) => signedStamp(entry, `signed-${entry.id}`))}
        {current?.signature && (
          <div
            className="absolute w-56 cursor-grab touch-none select-none active:cursor-grabbing"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); move(event.clientX, event.clientY); }}
            onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event.clientX, event.clientY); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.signature} alt={`${current.name} signature preview`} data-signature className="h-16 max-w-full object-contain object-left p-1" />
            <div className="mt-1 border-t border-dashed border-ink/60 pt-1">
              <p className="text-sm font-bold">{current.name}{current.final ? " · final sign-off" : ""}</p>
              <p className="text-xs font-medium text-ink-soft">Preview — saved when you approve</p>
            </div>
          </div>
        )}
      </div>

      {current?.signature && (
        <>
          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={() => setPosition({ x: 4, y: 18 })} className="rounded-lg bg-canvas px-3 py-1.5 text-xs font-bold text-ink-soft ring-1 ring-line ring-inset">Append bottom left</button>
            <button type="button" onClick={() => setPosition({ x: 32, y: 18 })} className="rounded-lg bg-canvas px-3 py-1.5 text-xs font-bold text-ink-soft ring-1 ring-line ring-inset">Bottom centre</button>
            <button type="button" onClick={() => setPosition({ x: 62, y: 18 })} className="rounded-lg bg-canvas px-3 py-1.5 text-xs font-bold text-ink-soft ring-1 ring-line ring-inset">Bottom right</button>
          </div>
          <ActionForm action={action} className="mt-3 flex justify-end print:hidden">
            <input type="hidden" name="id" value={requestId} />
            <input type="hidden" name="signature_x" value={position.x} />
            <input type="hidden" name="signature_y" value={position.y} />
            <SubmitBtn variant="outline">Save signature position</SubmitBtn>
          </ActionForm>
        </>
      )}
    </section>
  );
}
