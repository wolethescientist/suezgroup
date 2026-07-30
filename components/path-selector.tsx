import Link from "next/link";

/**
 * "I am a…" routing. A holding company's real job on the web is to get each visitor
 * to the right operating company fast, so the paths are the primary content rather
 * than a footer afterthought.
 */
const PATHS = [
  {
    who: "I need cooking gas",
    dest: "Suez Gas Nigeria",
    detail: "Cylinder refills 3–50 kg, delivered and weighed at your door.",
    href: "https://suezgas.com",
    external: true,
    accent: "#f58220",
  },
  {
    who: "I need electricity",
    dest: "SuezElectric",
    detail: "Prepaid tokens in seconds, across eleven distribution companies.",
    href: "https://suezelectric.com",
    external: true,
    accent: "#f18835",
  },
  {
    who: "I supply or off-take",
    dest: "Suez Trading International",
    detail: "Bulk LPG import and road-tanker haulage by contracted volume.",
    href: "/companies#upstream",
    external: false,
    accent: "#8d94a0",
  },
  {
    who: "I'm an investor or partner",
    dest: "Group office",
    detail: "Corporate profile, structure and commercial conversations.",
    href: "/contact",
    external: false,
    accent: "#f3852a",
  },
];

export function PathSelector() {
  return (
    <ul className="grid gap-px overflow-hidden rounded-2xl border border-slate-line bg-slate-line/60 sm:grid-cols-2">
      {PATHS.map((p, i) => {
        const Inner = (
          <>
            <div
              className="text-[0.6875rem] font-medium uppercase tracking-[0.09em]"
              style={{ color: p.accent }}
            >
              {p.who}
            </div>
            <div className="mt-4 flex items-baseline gap-2 font-display text-[1.375rem] leading-tight">
              {p.dest}
              <span
                aria-hidden="true"
                className="translate-y-[-1px] text-fg-slate-muted transition-colors duration-200 group-hover:text-current"
              >
                &rarr;
              </span>
            </div>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-slate-muted">
              {p.detail}
            </p>
          </>
        );

        const cls =
          "group relative flex h-full cursor-pointer flex-col bg-slate p-7 transition-colors duration-200 hover:bg-slate-2 sm:p-9";

        return (
          <li key={p.who} style={{ "--i": i } as React.CSSProperties}>
            {p.external ? (
              <a href={p.href} target="_blank" rel="noopener noreferrer" className={cls}>
                {Inner}
              </a>
            ) : (
              <Link href={p.href} className={cls}>
                {Inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
