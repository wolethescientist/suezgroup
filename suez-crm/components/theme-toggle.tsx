"use client";

import { useEffect, useState } from "react";

type Choice = "light" | "dark" | "system";

const KEY = "suez-theme";

/**
 * Light / dark / follow the system.
 *
 * Three states rather than two, because a two-way switch has to pick a side on
 * first load and whichever it picks is wrong for half the people. "System" is
 * the default and is honoured by a media query in globals.css; choosing light
 * or dark writes `data-theme` on <html>, which overrides it.
 *
 * The same key is read by the inline script in app/layout.tsx before the first
 * paint, so a reload does not flash the other theme.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<Choice>("system");
  // Rendered only after mount: the server has no idea what this browser
  // prefers, so painting a state here would be a hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* private browsing, blocked storage — fall back to following the system */
    }
    setChoice(saved === "dark" || saved === "light" ? saved : "system");
    setReady(true);
  }, []);

  const apply = (next: Choice) => {
    setChoice(next);
    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* nothing to do — the choice lasts for this page only */
      }
      return;
    }
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* as above */
    }
  };

  const OPTIONS: { key: Choice; label: string; icon: React.ReactNode }[] = [
    {
      key: "light",
      label: "Light",
      icon: (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ),
    },
    {
      key: "system",
      label: "System",
      icon: (
        <>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8m-4-4v4" />
        </>
      ),
    },
    {
      key: "dark",
      label: "Dark",
      icon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`flex items-center gap-0.5 rounded-xl bg-canvas p-0.5 ring-1 ring-line ring-inset ${
        compact ? "" : "w-full"
      }`}
    >
      {OPTIONS.map((o) => {
        const on = ready && choice === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.label}
            onClick={() => apply(o.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[0.6rem] px-2 py-1.5 text-[11px] font-bold transition-colors ${
              on ? "bg-surface text-ink shadow-raise" : "text-ink-soft hover:text-ink"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              {o.icon}
            </svg>
            {!compact && o.label}
          </button>
        );
      })}
    </div>
  );
}
