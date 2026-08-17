import Link from "next/link";
import { Strata, Web } from "./texture";
import { GroupMark, Logo } from "./logo";

const COMPANIES = [
  {
    name: "SuezElectric",
    role: "Prepaid electricity vending",
    rc: "RC 1638998",
    href: "https://suezelectric.com",
  },
  {
    name: "Suez Gas Nigeria",
    role: "Domestic & commercial LPG",
    rc: "RC 1076785",
    href: "https://suezgas.com",
  },
  {
    name: "Suez Trading International",
    role: "LPG import & bulk haulage",
    rc: null,
    href: null,
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-slate-line">
      <Strata tone="slate" opacity={0.5} />

      <div className="measure relative grid gap-14 py-16 lg:grid-cols-[1.1fr_1.5fr] lg:gap-24 lg:py-20">
        <div>
          <Logo markClass="h-11 w-auto" />
          <p className="mt-8 max-w-sm text-body-l text-fg-slate-muted">
            An Abuja energy group. Cooking gas since 2012, electricity since 2020,
            import and haulage behind both.
          </p>

          <address className="mt-9 space-y-3 not-italic">
            <FooterLine
              label="Office"
              value="20 Alexandria Crescent, Wuse II, Abuja FCT"
            />
            <FooterLine
              label="Group enquiries"
              value="info@suezgas.com"
              href="mailto:info@suezgas.com"
            />
          </address>
        </div>

        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h3 className="text-[0.6875rem] font-normal uppercase tracking-[0.09em] text-fg-slate-muted">
              Operating companies
            </h3>
            <ul className="mt-6">
              {COMPANIES.map((c) => (
                <li key={c.name} className="border-t border-slate-line py-4">
                  {c.href ? (
                    <a
                      href={c.href}
                      className="link-slide text-[1.0625rem] transition-colors duration-200 hover:text-ember"
                    >
                      {c.name}
                    </a>
                  ) : (
                    <span className="text-[1.0625rem]">{c.name}</span>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[0.6875rem] uppercase tracking-[0.075em] text-fg-slate-muted">
                    <span>{c.role}</span>
                    {c.rc && <span className="font-mono">{c.rc}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[0.6875rem] font-normal uppercase tracking-[0.09em] text-fg-slate-muted">
              Group
            </h3>
            <ul className="mt-6 space-y-3.5">
              {[
                ["/companies", "Our companies"],
                ["/about", "About the group"],
                ["/contact", "Contact"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="link-slide text-[0.9375rem] transition-colors duration-200 hover:text-ember"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[0.72rem] uppercase tracking-[0.08em] text-fg-slate-muted">
              <Link href="/privacy" className="link-slide hover:text-ember">Privacy</Link>
              <Link href="/terms" className="link-slide hover:text-ember">Terms</Link>
            </div>

            <h3 className="mt-10 text-[0.6875rem] font-normal uppercase tracking-[0.09em] text-fg-slate-muted">
              Advisers
            </h3>
            <ul className="mt-5 space-y-2 text-[0.9375rem] text-fg-slate-muted">
              <li>Oribera Limited — technical</li>
              <li>Reimnet Limited — technology</li>
              <li>Ashfar Limited — advisory</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Oversized mark as the closing signature — the web converging on the parent */}
      <div className="relative border-t border-slate-line">
        <Web origin={{ x: 22, y: 50 }} nodes={130} opacity={0.6} />
        <div className="measure relative flex items-center justify-between gap-8 py-16 lg:py-20">
          <span className="font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-none tracking-[-0.03em]">
            Suez Group
          </span>
          <GroupMark className="h-24 w-auto shrink-0 text-ember sm:h-32 lg:h-40" />
        </div>
      </div>

      <div className="measure relative flex flex-col gap-4 border-t border-slate-line py-8 text-[0.6875rem] uppercase tracking-[0.075em] text-fg-slate-muted sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Suez Group · Abuja, Nigeria</span>
        <span>
          Suez Group is a trading name for the companies listed above, each a
          separate legal entity.
        </span>
      </div>
    </footer>
  );
}

function FooterLine({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-36 shrink-0 text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          className="link-slide text-[0.9375rem] transition-colors duration-200 hover:text-ember"
        >
          {value}
        </a>
      ) : (
        <span className="text-[0.9375rem] leading-relaxed">{value}</span>
      )}
    </div>
  );
}
