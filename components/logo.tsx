import Link from "next/link";

/**
 * The group mark, authored for this site — no group logo existed.
 *
 * It is deliberately the union of the two subsidiary marks:
 *   · SuezElectric is a BULB with a BOLT knocked out of it
 *   · Suez Gas is a DROPLET with a FLAME knocked out of it
 * Those two silhouettes are near-identical — a rounded vessel tapering to a point.
 * So the group mark is that shared silhouette, with a knockout drawn to read as a
 * bolt at a glance and a flame tongue on a second look, plus the bulb's base bars.
 *
 * The knockout is a true evenodd hole rather than a filled shape, exactly as it is
 * in both subsidiary logos, so the mark sits on any background.
 */
export function GroupMark({ className = "h-9 w-auto" }: { className?: string }) {
  const VESSEL =
    "M36 3C48 24 64 36 64 50A28 28 0 0 1 8 50C8 36 24 24 36 3Z";
  // Bolt whose strokes lean and taper, so it also reads as a flame tongue
  const BOLT =
    "M39.5 19C34.5 31 28.5 42.5 23 51H34C32 57.5 30 63 28.5 69C35.5 60.5 43.5 50 49.5 40.5H38.5C38.5 33 39 25.5 39.5 19Z";

  return (
    <svg
      viewBox="0 0 72 96"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={`${VESSEL} ${BOLT}`} fillRule="evenodd" clipRule="evenodd" />
      {/* Base bars, carried over from the bulb in the SuezElectric mark */}
      <rect x="23" y="81" width="26" height="4" rx="2" />
      <rect x="27" y="89" width="18" height="4" rx="2" />
    </svg>
  );
}

/** Full lockup: mark plus a two-weight wordmark. */
export function Logo({
  className = "",
  markClass = "h-10 w-auto",
  tone = "slate",
}: {
  className?: string;
  markClass?: string;
  tone?: "slate" | "paper";
}) {
  return (
    <span className={`flex items-center gap-3.5 ${className}`}>
      <GroupMark className={`${markClass} text-ember`} />
      <span className="leading-none">
        <span
          className={`block text-[1.375rem] font-bold uppercase leading-none tracking-[-0.02em] ${
            tone === "slate" ? "text-fg-slate" : "text-fg-paper"
          }`}
        >
          Suez
        </span>
        <span
          className={`mt-1 block text-[0.6875rem] font-medium uppercase leading-none tracking-[0.34em] ${
            tone === "slate" ? "text-fg-slate-muted" : "text-fg-paper-muted"
          }`}
        >
          Group
        </span>
      </span>
    </span>
  );
}

export function Wordmark({ tone = "slate" }: { tone?: "slate" | "paper" }) {
  return (
    <Link href="/" aria-label="Suez Group — home" className="group flex items-center">
      <Logo tone={tone} markClass="h-8 w-auto sm:h-9" />
    </Link>
  );
}
