import type { ReactNode } from "react";
import { Web } from "./texture";
import { Reveal, WipeLines } from "./reveal";

/**
 * Section wrapper built on the group's index rail. Every section carries a number,
 * the way an annual report numbers its parts — the structural device that separates
 * this site from its two siblings.
 */
export function RailSection({
  index,
  label,
  children,
  tone = "slate",
  className = "",
  id,
}: {
  index: number;
  label: string;
  children: ReactNode;
  tone?: "slate" | "paper";
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden py-20 lg:py-28 ${
        tone === "paper" ? "on-paper" : "border-t border-slate-line"
      } ${className}`}
    >
      <Reveal className="measure relative">
        <div className="rail">
          <div className="rail-index lg:sticky lg:top-28 lg:self-start">
            <span>
              {String(index).padStart(2, "0")}
              <span className="mt-1.5 block opacity-70">{label}</span>
            </span>
          </div>
          <div>{children}</div>
        </div>
      </Reveal>
    </section>
  );
}

export function PageHero({
  eyebrow,
  lines,
  lede,
  aside,
}: {
  eyebrow: string;
  lines: string[];
  lede?: string;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-slate-line pb-16 pt-40 sm:pb-24 sm:pt-48">
      <Web origin={{ x: 90, y: 24 }} nodes={150} opacity={0.85} />
      {/* Each Reveal carries `reveal` on its own node, so the stagger resolves via
          .reveal.is-in > * rather than a descendant match — see app/page.tsx. */}
      <div className="measure relative">
        <div className="grid gap-12 lg:grid-cols-[1.35fr_0.8fr] lg:items-end lg:gap-24">
          <Reveal className="reveal" immediate>
            <div className="eyebrow" style={{ "--i": 0 } as React.CSSProperties}>
              {eyebrow}
            </div>
            <h1 className="mt-8 text-display-l">
              <WipeLines lines={lines} />
            </h1>
            {lede && (
              <p
                className="mt-9 max-w-xl text-body-l text-fg-slate-muted"
                style={{ "--i": lines.length + 1 } as React.CSSProperties}
              >
                {lede}
              </p>
            )}
          </Reveal>
          {aside && (
            <Reveal className="reveal lg:pb-3" immediate>
              <div style={{ "--i": lines.length + 2 } as React.CSSProperties}>
                {aside}
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

export function SectionTitle({
  title,
  lede,
  className = "",
}: {
  title: ReactNode;
  lede?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="max-w-3xl text-display-m">{title}</h2>
      {lede && <p className="mt-7 max-w-2xl text-body-l opacity-75">{lede}</p>}
    </div>
  );
}

/** Hairline-separated figure row. */
export function StatRow({
  items,
}: {
  items: { label: string; value: string; note?: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-y-9 border-t pt-9 lg:grid-cols-4">
      {items.map((s, i) => (
        <div
          key={s.label}
          className={`px-0 lg:px-8 ${i > 0 ? "lg:border-l" : "lg:pl-0"}`}
          style={{ "--i": i } as React.CSSProperties}
        >
          <dd className="font-display text-display-s">{s.value}</dd>
          <dt className="mt-2 text-[0.6875rem] uppercase tracking-[0.09em] opacity-65">
            {s.label}
          </dt>
          {s.note && <p className="mt-2 text-sm opacity-70">{s.note}</p>}
        </div>
      ))}
    </dl>
  );
}

export function PullQuote({
  children,
  attribution,
}: {
  children: ReactNode;
  attribution?: string;
}) {
  return (
    <blockquote className="max-w-4xl">
      <p className="text-display-m">{children}</p>
      {attribution && (
        <footer className="mt-8 text-[0.6875rem] uppercase tracking-[0.09em] opacity-65">
          {attribution}
        </footer>
      )}
    </blockquote>
  );
}
