import Link from "next/link";
import { Strata, Web } from "@/components/texture";
import { Reveal, WipeLines } from "@/components/reveal";
import { GroupMark } from "@/components/logo";
import { CompanyVisual, EnergyField } from "@/components/energy-visuals";
import { PathSelector } from "@/components/path-selector";
import {
  PullQuote,
  RailSection,
  SectionTitle,
  StatRow,
} from "@/components/page-parts";

const COMPANIES = [
  {
    name: "Suez Gas Nigeria",
    since: "2012",
    role: "Domestic & commercial LPG",
    body: "Cooking gas distribution and supply across Abuja — homes, estates, hotels, bars, eateries and bakeries — with cylinder pick-up, delivery and installation.",
    rc: "RC 1076785",
    href: "https://suezgas.com",
    cta: "suezgas.com",
    accent: "#f58220",
  },
  {
    name: "SuezElectric",
    since: "2020",
    role: "Prepaid electricity vending",
    body: "On-demand prepaid electricity tokens through web, mobile and an agent kiosk network, aggregated across Nigerian distribution companies.",
    rc: "RC 1638998",
    href: "https://suezelectric.com",
    cta: "suezelectric.com",
    accent: "#f18835",
  },
  {
    name: "Suez Trading International",
    since: null,
    role: "Import & bulk haulage",
    body: "LPG importation and bulk distribution to off-takers by road tanker. The upstream position that keeps the group's downstream pricing competitive.",
    rc: null,
    href: null,
    cta: null,
    accent: "#8d94a0",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative overflow-hidden pb-16 pt-36 sm:pt-44 lg:pb-24 lg:pt-52">
        <Web origin={{ x: 76, y: 36 }} nodes={220} />

        {/* `reveal` sits on the same node that receives `is-in`, so the stagger
            resolves via .reveal.is-in > * without relying on a descendant match. */}
        <div className="measure relative">
          <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            <Reveal className="reveal" immediate>
              <h1 className="text-display-xl">
                <WipeLines lines={["Energy,", "two ways."]} />
              </h1>

              <p
                className="mt-10 max-w-lg text-body-l text-fg-slate-muted"
                style={{ "--i": 3 } as React.CSSProperties}
              >
                Suez Group supplies the two things an Abuja household actually
                runs on — cooking gas and electricity — down one distribution
                network we have operated since 2012.
              </p>

              <div
                className="mt-11 flex flex-wrap items-center gap-3"
                style={{ "--i": 4 } as React.CSSProperties}
              >
                <Link href="/companies" className="btn btn-ember">
                  Our companies
                </Link>
                <Link href="/about" className="btn btn-ghost">
                  About the group
                </Link>
              </div>
            </Reveal>

            {/* Focal object: the group's actual structure */}
            <Reveal className="reveal relative" immediate delay={140}>
              <div
                className="relative"
                style={{ "--i": 0 } as React.CSSProperties}
              >
                <span className="ember-bloom left-[8%] top-[2%] h-[62%] w-[84%]" />
                <EnergyField />
              </div>
            </Reveal>
          </div>
        </div>

        {/* Enterprise-gateway path selection: route each visitor before anything else */}
        <div className="measure relative mt-20 lg:mt-28">
          <Reveal className="reveal">
            <div
              className="mb-7 flex flex-wrap items-baseline justify-between gap-4"
              style={{ "--i": 0 } as React.CSSProperties}
            >
              <div className="eyebrow">Start here</div>
              <span className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">
                Four doors, one group
              </span>
            </div>
            <div style={{ "--i": 1 } as React.CSSProperties}>
              <PathSelector />
            </div>
          </Reveal>
        </div>

        <div className="measure relative mt-20 lg:mt-24">
          <StatRow
            items={[
              { label: "Operating companies", value: "Three" },
              { label: "In business since", value: "2012" },
              { label: "Sectors", value: "LPG & power" },
              { label: "Base", value: "Wuse II, Abuja" },
            ]}
          />
        </div>

        <div className="measure relative mt-20 lg:mt-24">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="eyebrow">How the route works</div>
              <h2 className="mt-5 max-w-2xl text-display-m">Physical supply. Digital reach.</h2>
            </div>
            <p className="max-w-sm text-sm text-fg-slate-muted">The group moves between the cylinder, the token and the tanker — carrying the same operating discipline through each layer.</p>
          </div>
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_1fr]">
            <CompanyVisual kind="gas" />
            <CompanyVisual kind="power" />
            <CompanyVisual kind="trading" />
          </div>
        </div>
      </section>

      {/* ───────────────────────── 01 The companies ───────────────────────── */}
      <RailSection index={1} label="Companies" id="companies">
        <SectionTitle
          title="Three companies on one route."
          lede="Each is a separate legal entity with its own customers and its own front door. What they share is a fleet, a city and fourteen years of knowing it."
        />

        <Reveal className="reveal mt-16">
          {COMPANIES.map((c, i) => (
            <div
              key={c.name}
              className="group relative grid gap-6 border-t border-slate-line py-11 transition-colors duration-300 lg:grid-cols-[3.5rem_1fr_1.3fr] lg:gap-14"
              style={{ "--i": i } as React.CSSProperties}
            >
              {/* A hairline of the company's own colour lights up along the top rule */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-[-1px] h-px w-0 transition-[width] duration-500 ease-out group-hover:w-full"
                style={{ background: c.accent }}
              />
              <div
                className="font-display text-[2rem] leading-none opacity-30 transition-opacity duration-300 group-hover:opacity-100"
                style={{ color: c.accent }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h3 className="text-display-s">{c.name}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] uppercase tracking-[0.09em]">
                  <span style={{ color: c.accent }}>{c.role}</span>
                  {c.since && (
                    <span className="text-fg-slate-muted">Since {c.since}</span>
                  )}
                  {c.rc && (
                    <span className="font-mono text-fg-slate-muted">{c.rc}</span>
                  )}
                </div>
              </div>
              <div>
                <p className="max-w-xl text-fg-slate-muted">{c.body}</p>
                {c.href && (
                  <a
                    href={c.href}
                    className="link-slide mt-5 inline-block text-[0.9375rem] text-fg-slate transition-colors duration-200"
                    style={{ color: undefined }}
                  >
                    {c.cta} &rarr;
                  </a>
                )}
              </div>
            </div>
          ))}
        </Reveal>
      </RailSection>

      {/* ───────────────────────── 02 The thesis (paper) ───────────────────────── */}
      <RailSection index={2} label="Position" tone="paper">
        <PullQuote attribution="Suez Group">
          The hard part of energy retail in Nigeria is not finding demand. It is
          reaching the customer reliably, and being trusted with the money. We
          built the route first and added products to it.
        </PullQuote>

        <div className="reveal mt-16 grid gap-x-14 gap-y-10 md:grid-cols-3">
          {[
            [
              "One route, two products",
              "The trucks that deliver cooking gas serve the same estates that buy electricity tokens. Acquisition cost is shared, not duplicated.",
            ],
            [
              "Upstream to the meter",
              "Import and haulage through Suez Trading International, distribution through Suez Gas, digital vending through SuezElectric.",
            ],
            [
              "Physical plus digital",
              "Agent kiosks reach where the network thins out; the apps and web platform serve everyone else. Neither channel alone is enough here.",
            ],
          ].map(([title, body], i) => (
            <div
              key={title}
              className="border-t border-paper-line pt-6"
              style={{ "--i": i } as React.CSSProperties}
            >
              <h3 className="text-display-s">{title}</h3>
              <p className="mt-3 text-fg-paper-muted">{body}</p>
            </div>
          ))}
        </div>
      </RailSection>

      {/* ───────────────────────── 03 The mark ───────────────────────── */}
      <section className="relative overflow-hidden border-t border-slate-line py-20 lg:py-28">
        <Strata tone="slate" opacity={0.55} />
        <Reveal className="measure relative">
          <div className="rail">
            <div className="rail-index">
              <span>
                03
                <span className="mt-1.5 block opacity-70">Identity</span>
              </span>
            </div>
            <div className="grid items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-24">
              <div className="reveal">
                <SectionTitle
                  title="One mark, both businesses."
                  lede="The group mark is the union of its two operating logos. SuezElectric is a bulb with a bolt knocked out of it; Suez Gas is a droplet with a flame knocked out of it — and those silhouettes are very nearly the same shape."
                />
                <p
                  className="mt-6 max-w-2xl text-fg-slate-muted"
                  style={{ "--i": 1 } as React.CSSProperties}
                >
                  So the group takes that shared vessel, keeps the knockout — drawn
                  to read as a bolt at a glance and a flame on second look — and
                  carries over the bulb&rsquo;s base bars. The accent is the exact
                  midpoint of the two companies&rsquo; brand oranges.
                </p>
              </div>
              <div className="reveal shrink-0">
                <div
                  className="flex items-end gap-8"
                  style={{ "--i": 2 } as React.CSSProperties}
                >
                  <GroupMark className="h-40 w-auto text-ember sm:h-56" />
                  <dl className="space-y-4 border-l border-slate-line pl-6 text-[0.6875rem] uppercase tracking-[0.09em]">
                    <div>
                      <dt className="text-fg-slate-muted">Electric</dt>
                      <dd className="mt-1 font-mono normal-case tracking-normal">
                        #F18835
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-slate-muted">Gas</dt>
                      <dd className="mt-1 font-mono normal-case tracking-normal">
                        #F58220
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ember">Group</dt>
                      <dd className="mt-1 font-mono normal-case tracking-normal text-ember">
                        #F3852A
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────────────────────── CTA ───────────────────────── */}
      <section className="relative overflow-hidden border-t border-slate-line py-20 lg:py-28">
        <Web origin={{ x: 20, y: 52 }} nodes={150} opacity={0.7} />
        <Reveal className="measure relative flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow">Get in touch</div>
            <h2 className="mt-7 max-w-2xl text-display-l">
              Customer, supplier, or investor?
            </h2>
            <p className="mt-7 max-w-lg text-body-l text-fg-slate-muted">
              Buying gas or electricity goes to the operating company. Everything
              else comes to the group.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className="btn btn-ember">
              Contact the group
            </Link>
            <Link href="/companies" className="btn btn-ghost">
              I want to buy
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
