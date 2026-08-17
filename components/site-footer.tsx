import Link from "next/link";
import { GroupMark, Logo } from "./logo";

const COMPANIES = [
  ["Suez Software", "Digital products", "/companies#software"],
  ["Suez ICT", "Systems & infrastructure", "/companies#ict"],
  ["Suez Gas Nigeria", "LPG distribution", "https://suezgas.vercel.app/"],
  ["SuezElectric", "Prepaid electricity", "https://suezelectric.vercel.app/"],
  ["Suez Trading International", "Import & haulage", "/companies#trading"],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-line bg-slate-2">
      <div className="measure grid gap-14 py-16 lg:grid-cols-[1.1fr_1.4fr] lg:gap-24 lg:py-20">
        <div>
          <Logo markClass="h-11 w-auto" />
          <p className="mt-7 max-w-sm text-body-l text-fg-slate-muted">
            An Abuja energy group connecting the products, routes and people behind everyday energy.
          </p>
          <address className="mt-8 space-y-3 text-sm not-italic text-fg-slate-muted">
            <p>20 Alexandria Crescent, Wuse II, Abuja FCT</p>
            <a className="link-slide text-fg-slate" href="mailto:info@suezgas.com">info@suezgas.com</a>
          </address>
        </div>

        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-fg-slate-muted">The network</h3>
            <ul className="mt-5">
              {COMPANIES.map(([name, role, href]) => (
                <li key={name} className="border-t border-slate-line py-4">
                  {href.startsWith("http") ? <a href={href} target="_blank" rel="noopener noreferrer" className="link-slide text-[1rem] hover:text-ember-ink">{name}</a> : <Link href={href} className="link-slide text-[1rem] hover:text-ember-ink">{name}</Link>}
                  <span className="mt-1 block text-[0.68rem] uppercase tracking-[0.07em] text-fg-slate-muted">{role}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-fg-slate-muted">Group</h3>
            <ul className="mt-5 space-y-3 text-[0.95rem]">
              <li><Link href="/companies" className="link-slide hover:text-ember-ink">Our companies</Link></li>
              <li><Link href="/about" className="link-slide hover:text-ember-ink">About the group</Link></li>
              <li><Link href="/contact" className="link-slide hover:text-ember-ink">Contact</Link></li>
            </ul>
            <div className="mt-8 flex gap-5 text-[0.68rem] uppercase tracking-[0.08em] text-fg-slate-muted">
              <Link href="/privacy" className="link-slide hover:text-ember-ink">Privacy</Link>
              <Link href="/terms" className="link-slide hover:text-ember-ink">Terms</Link>
            </div>
            <h3 className="mt-8 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-fg-slate-muted">Social</h3>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[0.78rem]">
              <a href="https://www.facebook.com/suezgasnigeria/" target="_blank" rel="noopener noreferrer" className="link-slide hover:text-ember-ink">Facebook</a>
              <a href="https://www.instagram.com/suezelectric_/" target="_blank" rel="noopener noreferrer" className="link-slide hover:text-ember-ink">Instagram</a>
              <a href="https://www.linkedin.com/in/suezelectric-limited/" target="_blank" rel="noopener noreferrer" className="link-slide hover:text-ember-ink">LinkedIn</a>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-line">
        <div className="measure flex items-center justify-between gap-8 py-12 lg:py-16">
          <span className="font-display text-[clamp(2.6rem,7vw,6.3rem)] leading-none tracking-[-0.05em]">Suez Group</span>
          <GroupMark className="h-24 w-auto shrink-0 text-ember sm:h-32" />
        </div>
      </div>

      <div className="measure flex flex-col gap-3 border-t border-slate-line py-7 text-[0.66rem] uppercase tracking-[0.07em] text-fg-slate-muted sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Suez Group · Abuja, Nigeria</span>
        <span>Energy that keeps moving.</span>
      </div>
    </footer>
  );
}
