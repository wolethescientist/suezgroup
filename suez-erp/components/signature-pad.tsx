"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm, SubmitBtn, type Action } from "./form";

/**
 * Draw with a mouse/finger/stylus, or upload an image of a wet signature.
 * The result is a PNG data URL in a hidden field — no canvas library, no upload endpoint.
 */
export function SignaturePad({ action, existing }: { action: Action; existing: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [value, setValue] = useState("");
  const [uploadName, setUploadName] = useState("");

  // Crisp lines on high-DPI screens: size the bitmap to the CSS box × DPR.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = el.getBoundingClientRect();
    el.width = width * dpr;
    el.height = height * dpr;
    const ctx = el.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#191a2c";
  }, [mode]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(canvas.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const el = canvas.current;
    if (!el) return;
    el.getContext("2d")!.clearRect(0, 0, el.width, el.height);
    setValue("");
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 3_000_000) {
      setUploadName("Too large — keep it under 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setValue(String(reader.result));
      setUploadName(file.name);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl bg-canvas p-1 sm:w-fit">
        {(["draw", "upload"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setValue("");
              setUploadName("");
            }}
            className={`rounded-xl px-4 py-1.5 text-xs font-bold transition ${
              mode === m ? "bg-surface text-brand-700 shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {m === "draw" ? "Draw it" : "Upload an image"}
          </button>
        ))}
      </div>

      <ActionForm action={action} className="space-y-4">
        <input type="hidden" name="signature" value={value} />

        {mode === "draw" ? (
          <>
            {/* The pad is paper in both themes: the canvas strokes #191a2c so
                that the saved PNG works on a printed document, which on a dark
                surface would mean signing in invisible ink. */}
            <div data-signature-pad className="relative rounded-2xl border-2 border-dashed border-line">
              <canvas
                ref={canvas}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
                className="h-48 w-full touch-none rounded-2xl"
              />
              {!value && (
                <p className="pad-hint pointer-events-none absolute inset-0 grid place-items-center text-sm font-semibold">
                  Sign here with your mouse, finger or stylus
                </p>
              )}
              <span className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-line" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SubmitBtn>Save signature</SubmitBtn>
              <button type="button" onClick={clear} className="rounded-xl px-3.5 py-2 text-sm font-bold text-ink-soft hover:bg-canvas">
                Clear
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-12 text-center hover:border-brand-300 hover:bg-brand-50/40">
              <span className="text-2xl">⤒</span>
              <span className="text-sm font-bold">Choose a PNG or JPG of your signature</span>
              <span className="text-xs font-medium text-ink-soft">
                {uploadName || "A photo of a signature on white paper works well. Max 3 MB."}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {value && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="Signature preview" className="h-24 rounded-xl object-contain object-left p-2 ring-1 ring-line ring-inset" data-signature />
            )}
            <SubmitBtn>Save signature</SubmitBtn>
          </>
        )}
      </ActionForm>

      {existing && (
        <div className="rounded-2xl bg-canvas p-4">
          <p className="mb-2 text-[11px] font-bold tracking-wider text-ink-soft uppercase">Currently on file</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={existing} alt="Your saved signature" className="h-20 rounded-xl object-contain object-left p-2" data-signature />
        </div>
      )}
    </div>
  );
}
