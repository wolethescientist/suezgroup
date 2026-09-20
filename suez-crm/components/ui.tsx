import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { initials, titleCase } from "../lib/format";
import { BTN, VARIANTS, type Variant } from "./button-styles";

/* ------------------------------------------------------------------ badges */
// ponytail: one tone map for every status word in the app. New status? one line.
const TONES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  won: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  customer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",

  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  awaiting_info: "bg-amber-50 text-amber-700 ring-amber-200",
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  high: "bg-orange-50 text-orange-700 ring-orange-200",
  proposal: "bg-sky-50 text-sky-700 ring-sky-200",
  prospect: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-sky-50 text-sky-700 ring-sky-200",
  negotiation: "bg-violet-50 text-violet-700 ring-violet-200",
  qualification: "bg-brand-50 text-brand-700 ring-brand-200",
  lead: "bg-brand-50 text-brand-700 ring-brand-200",

  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  lost: "bg-rose-50 text-rose-700 ring-rose-200",
  urgent: "bg-rose-50 text-rose-700 ring-rose-200",
  churned: "bg-rose-50 text-rose-700 ring-rose-200",
  suspended: "bg-rose-50 text-rose-700 ring-rose-200",
  overdue: "bg-rose-50 text-rose-700 ring-rose-200",

  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  archived: "bg-slate-100 text-slate-500 ring-slate-200",
  low: "bg-slate-100 text-slate-500 ring-slate-200",
  normal: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Badge({ value, label, className = "" }: { value: string; label?: string; className?: string }) {
  const tone = TONES[value?.toLowerCase()] ?? "bg-brand-50 text-brand-700 ring-brand-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] leading-5 font-bold ring-1 ring-inset whitespace-nowrap ${tone} ${className}`}
    >
      {label ?? titleCase(value)}
    </span>
  );
}

/* ----------------------------------------------------------------- avatars */
const AVATAR_TONES = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];

const SIZES = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm", xl: "h-20 w-20 text-xl" };

export function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const tone = AVATAR_TONES[[...(name ?? "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={`${SIZES[size]} shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span
      title={name}
      className={`${SIZES[size]} ${tone} inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none ${className}`}
    >
      {initials(name ?? "?")}
    </span>
  );
}

/* ----------------------------------------------------------------- buttons */

export function Btn({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...props} className={`${BTN} ${VARIANTS[variant]} ${className}`} />;
}

export function BtnLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={`${BTN} ${VARIANTS[variant]} ${className}`} />;
}

/* -------------------------------------------------------------- structures */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {/* Tracking tightens as the size grows, or the title drifts apart. */}
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm font-medium text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`card p-5 ${className}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/**
 * A figure, with its caption.
 *
 * ponytail: every stat card wore a full-width gradient bar across the top in
 * one of five colours, and the colour was chosen per call site with nothing
 * behind the choice — "Accounts" was amber because the card beside it was blue.
 * Four of those in a row is a rainbow that tells you nothing and flattens the
 * one figure that matters into the noise.
 *
 * So the tone now means something: emerald is money in or a thing going well,
 * rose is a problem, amber wants attention, sky is neutral information. It is
 * carried by a small dot and by the figure itself rather than by a stripe, and
 * `brand` — the default — carries no colour at all, because most numbers on a
 * page are simply numbers.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "brand" | "emerald" | "amber" | "rose" | "sky";
}) {
  /*
   * The tone tints the dot and nothing else.
   *
   * Colouring the figure itself was tried and was worse: call sites pass a tone
   * to tell four cards in a row apart, not because the number means something,
   * so a green total beside a blue percentage beside an amber count is the same
   * rainbow in a different place. The figure is the content and stays ink; the
   * dot is a quiet marker for the cards where the tone was chosen on purpose.
   */
  const dot = {
    brand: "",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    sky: "bg-sky-500",
  }[tone];
  return (
    <div className="card stat-card p-5">
      <p className="eyebrow flex items-center gap-1.5">
        {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />}
        {label}
      </p>
      <p className="stat-value mt-2.5">{value}</p>
      {hint && <p className="mt-1.5 text-xs font-medium text-ink-soft">{hint}</p>}
    </div>
  );
}

/**
 * Nothing here yet.
 *
 * ponytail: a bare "✦" in a grey square, which is the shape of an icon without
 * being one. The mark is now drawn from the same stroke set as the rest of the
 * interface and sits in a tinted ring, so an empty list looks like a state the
 * product has an opinion about rather than a screen that failed to load.
 */
export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span
        className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-brand-100 ring-inset"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
             strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
          <path d="M9 12h6" />
        </svg>
      </span>
      <p className="text-[15px] font-bold">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-sm leading-relaxed font-medium text-ink-soft">{hint}</p>}
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-medium text-ink-soft">{hint}</span>}
    </label>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>{children}</div>;
}

/** Table shell — thead/tbody supplied by the caller. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-full text-left text-sm">
        {/*
          The header stays put while a long table scrolls, and sits on its own
          tint so it reads as a header rather than as the first row. ponytail:
          scroll a hundred employees and you lost the column names entirely.
        */}
        <thead className="sticky top-0 z-10 bg-canvas/80 backdrop-blur">
          <tr className="border-b border-line-strong">
            {head.map((h, i) => (
              <th key={i} className="eyebrow px-5 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`px-5 py-3.5 align-middle font-medium ${className}`}>{children}</td>
);
