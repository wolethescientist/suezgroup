import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, RailSection, SectionTitle } from "@/components/page-parts";
import { Reveal } from "@/components/reveal";
import { RouteSignal } from "@/components/energy-visuals";

export const metadata: Metadata = {
  title: "Services & companies",
  description:
    "Explore the five Suez Group lanes: Software, ICT, Gas, Trading and Electric.",
};

const SERVICES = [
  {
    id: "software",
    number: "01",
    label: "Software",
    name: "Suez Software",
    role: "Digital products & software platforms",
    body: "Software is the group’s product layer: practical digital tools that make services easier to use, operate and scale. It turns the knowledge inside the network into products people can rely on.",
    facts: [["Focus", "Digital products and platforms"], ["Works with", "Group services and operating teams"], ["Route", "Product thinking / useful tools"]],
    tone: "software",
    href: undefined,
  },
  {
    id: "ict",
    number: "02",
    label: "ICT",
    name: "Suez ICT",
    role: "Systems, connectivity & technical infrastructure",
    body: "ICT is the connective tissue behind the group: systems, integrations, technical support and the infrastructure that keeps people, information and services moving together.",
    facts: [["Focus", "Connectivity and technical systems"], ["Works with", "Internal teams and service operations"], ["Route", "Systems / support / network"]],
    tone: "ict",
    href: undefined,
  },
  {
    id: "gas",
    number: "03",
    label: "Gas",
    name: "Suez Gas Nigeria",
    role: "Domestic & commercial LPG distribution",
    body: "Suez Gas distributes LPG for residential, commercial and industrial use. Cylinder refills range from 3kg to 50kg, with doorstep pick-up and return, bulk haulage and professional installation.",
    facts: [["Serves", "Homes, estates, hotels, bars and bakeries"], ["Range", "3 - 50 kg cylinders"], ["Contact", "+234 816 800 3677"]],
    tone: "gas",
    href: "https://suezgas.vercel.app/",
  },
  {
    id: "trading",
    number: "04",
    label: "Trading",
    name: "Suez Trading International",
    role: "LPG importation & bulk haulage",
    body: "The upstream lane for LPG importation and road-tanker haulage. Suez Trading supplies off-takers, plants and industrial sites by volume and connects the group to its source markets.",
    facts: [["Serves", "Off-takers, plants and industrial sites"], ["Mode", "Road tanker, contracted by volume"], ["Contact", "Through the group office"]],
    tone: "trading",
    href: undefined,
  },
  {
    id: "electric",
    number: "05",
    label: "Electric",
    name: "SuezElectric",
    role: "Prepaid electricity vending & e-payments",
    body: "SuezElectric generates prepaid electricity tokens on demand through web, mobile and agent channels, with a wallet, retrievable transaction history and printable receipts.",
    facts: [["Serves", "Prepaid, postpaid and net-metered accounts"], ["Channels", "Web, iOS, Android and agent kiosks"], ["Contact", "+234 908 007 0070"]],
    tone: "electric",
    href: "https://suezelectric.vercel.app/",
  },
] as const;

function ServiceGlyph({ tone }: { tone: (typeof SERVICES)[number]["tone"] }) {
  return <span className={`service-glyph service-glyph-${tone}`} aria-hidden="true">{tone === "software" ? "⌘" : tone === "ict" ? "╱╲" : tone === "gas" ? "◒" : tone === "trading" ? "⌁" : "ϟ"}</span>;
}

export default function CompaniesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services & companies"
        lines={["Five operating lanes,", "one group."]}
        lede="Software, ICT, Gas, Trading and Electric. Each lane has a clear job; together they form the network behind Suez Group."
        aside={
          <div className="grid gap-10">
            <dl className="space-y-4 border-l border-slate-line pl-6">
              <div><dt className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">Lanes</dt><dd className="mt-1.5 text-[0.9375rem]">Software · ICT · Gas · Trading · Electric</dd></div>
              <div><dt className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">Shared base</dt><dd className="mt-1.5 text-[0.9375rem]">20 Alexandria Crescent, Wuse II</dd></div>
              <div><dt className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">Group since</dt><dd className="mt-1.5 text-[0.9375rem]">2012</dd></div>
            </dl>
            <RouteSignal label="Operating model" value="five lanes / one route" />
          </div>
        }
      />

      <section className="service-directory">
        <div className="measure">
          <div className="rail-index"><span>01</span><span>Directory</span></div>
          <div className="service-directory-heading">
            <Reveal><h2 className="text-display-m">Choose the part of the network you need.</h2><p>Some lanes are customer-facing businesses; Software and ICT are the digital capabilities that help the whole group work better.</p></Reveal>
          </div>
          <div className="service-directory-grid">
            {SERVICES.map((service) => (
              <a key={service.id} href={`#${service.id}`} className={`service-directory-card service-directory-card-${service.tone}`}>
                <span>{service.number}</span><ServiceGlyph tone={service.tone} /><strong>{service.label}</strong><small>{service.role}</small><b aria-hidden="true">↓</b>
              </a>
            ))}
          </div>
        </div>
      </section>

      {SERVICES.map((service, index) => (
        <RailSection key={service.id} index={index + 2} label={service.label} id={service.id} tone={index % 2 === 1 ? "paper" : "slate"}>
          <SectionTitle title={service.name} />
          <div className={`service-detail service-detail-${service.tone}`}>
            <div className="service-detail-visual"><ServiceGlyph tone={service.tone} /><span>{service.label} / {service.number}</span><small>{service.role}</small></div>
            <div>
              <p className="text-body-l text-fg-slate-muted">{service.body}</p>
              {service.href ? <a className="btn btn-ember mt-8" href={service.href} target="_blank" rel="noopener noreferrer">Visit {service.label} <span aria-hidden="true">↗</span></a> : <Link className="btn btn-ghost mt-8" href="/contact">Ask about {service.label} <span aria-hidden="true">→</span></Link>}
            </div>
            <dl className="service-facts">
              {service.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </div>
        </RailSection>
      ))}

      <section className="service-closing">
        <div className="measure flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="eyebrow">Need a route into the group?</div><h2 className="mt-7 max-w-xl text-display-m">Not sure which lane is yours?</h2></div>
          <Link href="/contact" className="btn btn-ember">Ask the group <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </>
  );
}
