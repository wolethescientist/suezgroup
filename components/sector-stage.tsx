"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SECTOR_SLIDES } from "@/lib/sectors";

/**
 * The sector stage — the group's background, as a sequence.
 *
 * A holding company photographed as one company is a holding company nobody
 * believes in. So the hero, the about hero and the closing band all run the
 * same five frames, one per operating company, cross-fading over each other
 * with a slow drift, and each frame carries its own write-up.
 *
 * Split into a provider plus consumers so the frames can sit behind the copy
 * (absolutely, full bleed) while the write-up sits inside the copy column, in
 * normal flow, without either duplicating state or fighting the layout.
 */

type Cycle = {
  index: number;
  count: number;
  interval: number;
  /** Frame leaving the stage — held opaque underneath so the fade never dips. */
  previous: number;
  reduced: boolean;
  show: (index: number) => void;
  setPaused: (paused: boolean) => void;
  /** A frame reports itself decoded; the cycle refuses to fade into a blank one. */
  markReady: (index: number) => void;
};

const CycleCtx = createContext<Cycle | null>(null);

function useCycle(): Cycle {
  const cycle = useContext(CycleCtx);
  if (!cycle) throw new Error("Sector stage parts must render inside <SectorCycle>.");
  return cycle;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export function SectorCycle({
  interval = 7400,
  children,
}: {
  interval?: number;
  children: ReactNode;
}) {
  const count = SECTOR_SLIDES.length;
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [due, setDue] = useState(false);
  const reduced = usePrefersReducedMotion();

  const show = useCallback((next: number) => {
    setIndex((current) => {
      if (next === current) return current;
      setPrevious(current);
      return next;
    });
  }, []);

  const markReady = useCallback((frame: number) => {
    setReady((current) => (current.has(frame) ? current : new Set(current).add(frame)));
  }, []);

  useEffect(() => {
    // Reduced motion gets a still frame and the dots — never an auto-advance.
    if (reduced || paused || count < 2) return;
    const timer = setTimeout(() => setDue(true), interval);
    return () => clearTimeout(timer);
  }, [index, interval, paused, reduced, count]);

  useEffect(() => {
    // The turn is taken only once the incoming photograph has decoded, so a
    // slow network holds the current frame rather than fading through black.
    if (!due) return;
    const next = (index + 1) % count;
    if (!ready.has(next)) return;
    setDue(false);
    show(next);
  }, [due, ready, index, count, show]);

  const value = useMemo(
    () => ({ index, previous, count, interval, reduced, show, setPaused, markReady }),
    [index, previous, count, interval, reduced, show, markReady],
  );

  return <CycleCtx.Provider value={value}>{children}</CycleCtx.Provider>;
}

/**
 * The photographs themselves. `tone` only picks the scrim: the hero needs a
 * heavy left wash for a display headline, a page hero needs less, and the
 * closing band needs the frame pushed almost to black behind the wordmark.
 */
export function SectorFrames({
  tone = "hero",
  className = "",
}: {
  tone?: "hero" | "page" | "band";
  className?: string;
}) {
  const { index, previous, interval, reduced, markReady } = useCycle();

  /**
   * Only the frame on stage and the one after it are in the document, so the
   * page opens on one photograph rather than five. Each subsequent frame is
   * mounted a full interval before it is needed, which is long enough to have
   * decoded by the time it fades in.
   */
  const [mounted, setMounted] = useState(() => new Set([0, 1 % SECTOR_SLIDES.length]));
  useEffect(() => {
    setMounted((current) => {
      const next = (index + 1) % SECTOR_SLIDES.length;
      if (current.has(index) && current.has(next)) return current;
      return new Set(current).add(index).add(next);
    });
  }, [index]);

  return (
    <div className={`sector-frames sector-frames-${tone} ${className}`} aria-hidden="true">
      {SECTOR_SLIDES.map((slide, i) => {
        const active = i === index;
        const holding = i === previous;
        return (
          <div
            key={slide.id}
            className={`sector-frame${active ? " is-active" : ""}`}
            style={{
              // The frame leaving stays opaque directly beneath the one arriving,
              // so the cross-fade never dips through the ground colour.
              opacity: active || holding ? 1 : 0,
              zIndex: active ? 3 : holding ? 2 : 1,
              // Drift runs exactly as long as the frame is on stage.
              animationDuration: reduced ? undefined : `${interval + 1600}ms`,
            }}
          >
            {mounted.has(i) && (
              <Image
                src={slide.photo}
                alt=""
                fill
                priority={i === 0}
                sizes="100vw"
                style={slide.position ? { objectPosition: slide.position } : undefined}
                onLoad={() => markReady(i)}
                // A frame that cannot load must not stall the sequence.
                onError={() => markReady(i)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Shared control strip: which company is on stage, and how to jump to another. */
function SectorDots({ label }: { label: string }) {
  const { index, show, setPaused } = useCycle();
  return (
    <div
      className="sector-dots"
      role="group"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SECTOR_SLIDES.map((slide, i) => (
        <button
          key={slide.id}
          type="button"
          className={i === index ? "is-active" : undefined}
          aria-label={slide.company}
          aria-current={i === index}
          onClick={() => show(i)}
        >
          <i />
        </button>
      ))}
    </div>
  );
}

/**
 * The write-up panel. Sits in the hero's copy column, in flow, so nothing has
 * to be absolutely positioned against a headline that changes size at every
 * breakpoint.
 */
export function SectorNote() {
  const { index, count, interval, reduced, setPaused } = useCycle();
  const slide = SECTOR_SLIDES[index];

  return (
    <aside
      className="sector-note"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="sector-note-progress"
        style={{ animationDuration: reduced ? undefined : `${interval}ms` }}
        // Restarts the sweep on every change of frame.
        key={slide.id}
        aria-hidden="true"
      />
      <div className="sector-note-head">
        <span>{slide.company}</span>
        <span>
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
      </div>
      <strong key={`${slide.id}-sector`}>{slide.sector}</strong>
      <p key={`${slide.id}-body`}>{slide.body}</p>
      <SectorDots label="Choose a company" />
    </aside>
  );
}

/** One line and the dots — for heroes and bands that already carry their own copy. */
export function SectorCaption({ className = "" }: { className?: string }) {
  const { index } = useCycle();
  const slide = SECTOR_SLIDES[index];

  return (
    <div className={`sector-caption ${className}`}>
      <span className="sector-caption-company">{slide.company}</span>
      <span className="sector-caption-note" key={slide.id}>{slide.note}</span>
      <SectorDots label="Choose a company" />
    </div>
  );
}
