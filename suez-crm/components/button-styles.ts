// Shared by ui.tsx (server), form.tsx and print-button.tsx (client). Plain constants,
// no directive, so both sides can import them and the palette lives in one place.
//
// The brand is a bright orange (#f3862a). White text on it measures 2.5:1 and fails
// WCAG AA, so primary surfaces carry dark ink instead: ink on brand-500 is 6.7:1, and
// 5.4:1 on the brand-600 hover. Do not "fix" these to text-white.
export const VARIANTS = {
  primary: "bg-brand-500 text-on-brand hover:bg-brand-600 shadow-sm shadow-brand-600/30 hover:shadow-md hover:shadow-brand-600/25",
  soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  ghost: "text-ink-soft hover:bg-canvas hover:text-ink",
  outline: "border border-line bg-surface text-ink hover:border-line-strong hover:bg-canvas",
  danger: "bg-danger text-white hover:bg-danger-hover shadow-sm shadow-danger/30",
  success: "bg-success text-white hover:bg-success-hover shadow-sm shadow-success/30",
};

export type Variant = keyof typeof VARIANTS;

/**
 * ponytail: `transition` with no duration and no press state, so a button
 * changed colour on hover and did nothing at all when clicked. The 1px nudge on
 * :active is the whole difference between a control that feels connected to the
 * pointer and one that feels like a picture of a button.
 */
export const BTN =
  "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold " +
  "transition-[background-color,box-shadow,transform,border-color] duration-150 ease-out " +
  "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none " +
  "disabled:active:translate-y-0";

/** Selected tab / active nav item — same contrast reasoning as `primary`. */
export const ACTIVE = "bg-brand-500 text-on-brand shadow-sm shadow-brand-600/25";
export const INACTIVE = "text-ink-soft hover:bg-canvas hover:text-ink";
