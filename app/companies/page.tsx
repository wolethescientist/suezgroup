import type { Metadata } from "next";
import Link from "next/link";
import { Strata, Web } from "@/components/texture";
import { Reveal } from "@/components/reveal";
import { PageHero, RailSection, SectionTitle } from "@/components/page-parts";
import { CompanyVisual, RouteSignal } from "@/components/energy-visuals";

export const metadata: Metadata = {
  title: "Our companies",
  description:
    "Suez Gas Nigeria, SuezElectric and Suez Trading International. Meet the three operating companies of Suez Group and find the right one to reach.",
};

const COMPANIES = [
  {
    index: 1,
    label: "LPG",
    name: "Suez Gas Nigeria Limited",
    rc: "RC 1076785 · incorporated 7 November 2012",
    role: "Domestic & commercial LPG distribution",
    body: [
      "The oldest company in the group and the one that built the route. Suez Gas distributes and supplies domestic LPG and natural gas for residential, commercial and industrial use, and develops natural gas utilisation projects.",
      "Cylinder refills from 3kg to 50kg with doorstep pick-up and return, bulk haulage, professional installation and consultancy. Every delivery is weighed on a digital scale in front of the customer.",
    ],
    facts: [
      ["Serves", "Homes, estates, hotels, bars, bakeries"],
      ["Cylinder range", "3 - 50 kg"],
      ["Contact", "+234 816 800 3677"],
    ],
    href: "https://suezgas.com",
    cta: "Visit suezgas.com",
    visual: "gas" as const,
  },
  {
    index: 2,
    label: "Power",
    name: "SuezElectric Limited",
    rc: "RC 1638998 · platform live since 2020",
    role: "Prepaid electricity vending & e-payments",
    body: [
      "Incorporated to purchase and distribute power through electronic channels to domestic and industrial users. SuezElectric generates prepaid electricity tokens on demand, aggregated across multiple distribution companies and meter technologies.",
      "Web and mobile apps with a wallet, a naira-to-unit calculator, retrievable transaction history and printable receipts, plus an agent network earning up to 3% commission from mobile kiosks.",
    ],
    facts: [
      ["Serves", "Prepaid, postpaid and net-metered accounts"],
      ["Channels", "Web, iOS, Android, agent kiosks"],
      ["Contact", "+234 908 007 0070"],
    ],
    href: "https://suezelectric.com",
    cta: "Visit suezelectric.com",
    visual: "power" as const,
  },
  {
    index: 3,
    label: "Upstream",
    name: "Suez Trading International",
    rc: null,
    role: "LPG importation & bulk haulage",
    body: [
      "The group's upstream arm. Suez Trading imports LPG and distributes it to off-takers by road tanker, and holds the group's real-estate and infrastructure investment interests.",
      "This position is why the downstream companies can price competitively. The group is not buying its product from a competitor.",
    ],
    facts: [
      ["Serves", "Off-takers, plants, industrial sites"],
      ["Mode", "Road tanker, contracted by volume"],
      ["Contact", "Through the group"],
    ],
    href: null,
    cta: null,
    visual: "trading" as const,
  },
];

export default function CompaniesPage() {
  return (
    <>
      <PageHero
        eyebrow="Operating companies"
        lines={["Three front doors,", "one group."]}
        lede="Each company is a separate legal entity trading under its own name. If you are buying, go straight to the one you need. The links are below."
        aside={
          <div className="grid gap-10">
            <dl className="space-y-4 border-l border-slate-line pl-6">
              {[
                ["Sectors", "LPG · electricity · haulage"],
                ["Shared base", "20 Alexandria Crescent, Wuse II"],
                ["Group since", "2012"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">
                    {k}
                  </dt>
                  <dd className="mt-1.5 text-[0.9375rem]">{v}</dd>
                </div>
              ))}
            </dl>
            <RouteSignal label="Route architecture" value="one group / three doors" />
          </div>
        }
      />

      {COMPANIES.map((c) => (
        <RailSection
          key={c.name}
          index={c.index}
          label={c.label}
          id={c.index === 3 ? "upstream" : undefined}
          tone={c.index === 2 ? "paper" : "slate"}
        >
          <SectionTitle title={c.name} />
          <div
            className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] uppercase tracking-[0.09em] ${
              c.index === 2 ? "text-ember-ink" : "text-ember"
            }`}
          >
            <span>{c.role}</span>
          </div>
          {c.rc && (
            <div
              className={`mt-2 font-mono text-[0.75rem] ${
                c.index === 2 ? "text-fg-paper-muted" : "text-fg-slate-muted"
              }`}
            >
              {c.rc}
            </div>
          )}

          <Reveal className="reveal mt-10 grid gap-10 lg:grid-cols-[0.72fr_1.45fr_0.8fr] lg:gap-14">
            <div style={{ "--i": 0 } as React.CSSProperties}>
              <CompanyVisual kind={c.visual} />
            </div>
            <div style={{ "--i": 1 } as React.CSSProperties}>
              {c.body.map((p) => (
                <p
                  key={p}
                  className={`mt-5 max-w-2xl text-body-l first:mt-0 ${
                    c.index === 2 ? "text-fg-paper-muted" : "text-fg-slate-muted"
                  }`}
                >
                  {p}
                </p>
              ))}
              {c.href && (
                <a
                  href={c.href}
                  className="btn btn-ember mt-9"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.cta}
                </a>
              )}
            </div>

            <dl style={{ "--i": 2 } as React.CSSProperties}>
              {c.facts.map(([k, v]) => (
                <div key={k} className="border-t py-4">
                  <dt
                    className={`text-[0.6875rem] uppercase tracking-[0.09em] ${
                      c.index === 2 ? "text-fg-paper-muted" : "text-fg-slate-muted"
                    }`}
                  >
                    {k}
                  </dt>
                  <dd className="mt-1.5 text-[0.9375rem]">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </RailSection>
      ))}

      {/* Advisers */}
      <section className="relative overflow-hidden border-t border-slate-line py-20 lg:py-24">
        <Strata tone="slate" opacity={0.5} />
        <Reveal className="measure relative">
          <div className="rail">
            <div className="rail-index">
              <span>
                04
                <span className="mt-1.5 block opacity-70">Advisers</span>
              </span>
            </div>
            <div>
              <SectionTitle
                title="Partners and advisers."
                lede="The group works with a standing set of technical, technology and advisory partners rather than rebuilding those functions in-house."
              />
              <Reveal className="reveal mt-12 grid gap-x-14 gap-y-8 sm:grid-cols-3">
                {[
                  ["Oribera Limited", "Technical partner", "Platform architecture and integrations"],
                  ["Reimnet Limited", "Technology partner", "Application delivery and infrastructure"],
                  ["Ashfar Limited", "Consultants", "Regulatory, commercial and financial advisory"],
                ].map(([name, tag, body], i) => (
                  <div
                    key={name}
                    className="border-t border-slate-line pt-6"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <h3 className="text-display-s">{name}</h3>
                    <div className="mt-2 text-[0.6875rem] uppercase tracking-[0.09em] text-ember">
                      {tag}
                    </div>
                    <p className="mt-3 text-fg-slate-muted">{body}</p>
                  </div>
                ))}
              </Reveal>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="relative overflow-hidden border-t border-slate-line py-20 lg:py-24">
        <Web origin={{ x: 82, y: 50 }} nodes={140} opacity={0.7} />
        <Reveal className="measure relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-xl text-display-m">
            Not sure which company you need?
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className="btn btn-ember">
              Ask the group
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
