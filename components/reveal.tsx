"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";

/** Default true so a WipeLines used outside a Reveal renders visible, not hidden. */
const RevealCtx = createContext(true);

const ENTRANCE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Adds the entrance state for its subtree. IntersectionObserver instead of a motion
 * library — the whole system is a few dozen lines and ships no runtime.
 *
 * Children stagger via CSS (`.reveal-hidden > *`), applied by a class that is
 * REMOVED to reveal, so nothing has to out-specify anything. Headlines go through
 * WipeLines, which reads this context and writes inline styles — that path is
 * immune to stylesheet ordering entirely.
 */
export function Reveal({
  children,
  as: Tag = "div",
  className = "",
  /** Fires on load — for above-the-fold content that shouldn't wait on scroll */
  immediate = false,
  delay = 0,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  immediate?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      setInView(true);
    };

    if (immediate) {
      // One paint with the hidden state, then reveal. rAF gets there on the next
      // frame when visible — but rAF is SUSPENDED in a hidden or background tab,
      // which would leave the hero invisible until focus. The timer backs it up;
      // whichever fires first wins.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(fire);
      });
      const timer = setTimeout(fire, 120 + delay);
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        clearTimeout(timer);
      };
    }

    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fire();
          io.disconnect(); // reveal once, never re-animate on scroll back
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate, delay]);

  return (
    <RevealCtx.Provider value={inView}>
      <Tag
        ref={ref as React.Ref<HTMLElement>}
        className={`${className}${inView ? "" : " reveal-hidden"}`}
      >
        {children}
      </Tag>
    </RevealCtx.Provider>
  );
}

/**
 * Heading whose lines wipe up from a clipped baseline, staggered.
 * Transform is inline and driven by React state, so no stylesheet can override it.
 */
export function WipeLines({
  lines,
  className = "",
}: {
  lines: ReactNode[];
  className?: string;
}) {
  const inView = useContext(RevealCtx);

  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={`wipe ${className}`}>
          <span
            style={{
              display: "block",
              transform: inView ? "none" : "translate3d(0, 105%, 0)",
              transition: `transform 620ms ${ENTRANCE}`,
              transitionDelay: `${i * 60}ms`,
            }}
          >
            {line}
          </span>
        </span>
      ))}
    </>
  );
}
