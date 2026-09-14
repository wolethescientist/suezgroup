import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CodePanel } from "@/components/code-panel";
import { PageHero, RailSection, SectionTitle } from "@/components/page-parts";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Services & companies",
  description:
    "The five Suez Group companies — Gas, Trading, Electric, Software and ICT — and the eight sectors they cover across Nigeria.",
};

const SERVICES = [
  {
    id: "gas",
    number: "01",
    label: "Gas",
    name: "Suez Gas Nigeria",
    role: "Domestic & commercial LPG distribution",
    body:
      "The company the group started with. Suez Gas distributes LPG for residential, commercial and industrial use — cylinder refills from 3kg to 50kg with doorstep pick-up and return, bulk supply for plants and estates, tank telemetry and professional installation. Every cylinder is weighed in front of the customer.",
    facts: [
      ["Serves", "Homes, estates, hotels, bars, eateries and bakeries"],
      ["Range", "3kg to 50kg cylinders, plus bulk"],
      ["Registered", "RC 1076785 · incorporated 7 November 2012"],
      ["Contact", "+234 816 800 3677 · info@suezgas.com"],
    ],
    divisions: [
      ["Cylinder refills", "3kg to 50kg, weighed at the point of exchange"],
      ["Doorstep service", "Pick-up and return across Abuja and the FCT"],
      ["Bulk supply", "Plants, estates, hotels and industrial kitchens"],
      ["Telemetry & installation", "Tank monitoring, pipework and field support"],
    ],
    photo: "/photos/team.jpg",
    alt: "A Suez Gas crew weighing a customer cylinder on a certified scale at the point of delivery",
    href: "https://suezgas.vercel.app/",
  },
  {
    id: "trading",
    number: "02",
    label: "Trading",
    name: "Suez Trading Internationale",
    role: "General trading, supply, haulage and civil works",
    body:
      "The broadest company in the group, and the reason Suez is not only an energy business. Suez Trading runs seven divisions across one value chain — petroleum supply, oilfield services, haulage, construction, general supplies, facility services and FMCG distribution — delivered to thirty-six states from Abuja on a typical 24–72 hour window.",
    facts: [
      ["Serves", "Off-takers, plants, contractors, institutions and government"],
      ["Divisions", "Seven, across supply, logistics, works and distribution"],
      ["Reach", "36 states · typical 24–72 hour delivery window"],
      ["Contact", "+234 908 007 0070 · info@sueztrading.com"],
    ],
    divisions: [
      ["Petroleum products & supply", "Bulk and retail AGO, PMS, DPK, LPG and lubricants"],
      ["Oil & gas field services", "Upstream and midstream operational support"],
      ["Haulage & logistics", "Tanker haulage and general freight movement"],
      ["Construction & civil works", "Roads, bridges and building projects"],
      ["General supplies & distribution", "Building materials, merchandise and procurement"],
      ["Facility & environmental services", "Waste management, landscaping and site upkeep"],
      ["FMCG distribution", "Fast-moving consumer goods on established routes"],
      ["Own-brand product", "The SUEZ SRG smart gas regulator, sold online"],
    ],
    photo: "/photos/logistics.jpg",
    alt: "Container handlers moving freight across a distribution terminal",
    href: "https://suez-trading.vercel.app/",
  },
  {
    id: "electric",
    number: "03",
    label: "Electric",
    name: "SuezElectric",
    role: "Prepaid electricity vending & e-payments",
    body:
      "The group's first digital-native company. SuezElectric generates prepaid electricity tokens on demand across eleven distribution companies, through web, iOS, Android and a network of agent kiosks — with a wallet, retrievable transaction history and printable receipts. Median time from payment to token is fourteen seconds.",
    facts: [
      ["Serves", "Prepaid, postpaid and net-metered accounts, Band A to E"],
      ["Channels", "Web, iOS, Android and agent kiosks"],
      ["Registered", "RC 1638998 · platform live December 2020"],
      ["Contact", "+234 908 007 0070 · support@suezelectric.com"],
    ],
    divisions: [
      ["Token vending", "Eleven discos, Sokoto to Port Harcourt"],
      ["Wallet & history", "Retrievable receipts and repeat purchases"],
      ["Agent network", "Kiosk agents earning commission on every sale"],
      ["Business accounts", "Estates and landlords managing many meters"],
    ],
    photo: "/platforms/suezelectric.jpg",
    alt: "The SuezElectric platform showing a prepaid token delivered fourteen seconds after payment",
    href: "https://suezelectric.vercel.app/",
  },
  {
    id: "software",
    number: "04",
    label: "Software",
    name: "Suez Software",
    role: "Digital products & software platforms",
    body:
      "The group's product layer. Software builds the vending platforms, commerce storefronts and internal tools the rest of the network runs on — turning fourteen years of operating knowledge into products, rather than buying generic systems that do not understand the route.",
    facts: [
      ["Focus", "Digital products, storefronts and operating platforms"],
      ["Built", "SuezElectric vending, Suez Trading commerce, internal tools"],
      ["Works with", "Every operating company in the group"],
      ["Contact", "Through the group office"],
    ],
    divisions: [
      ["Product engineering", "Customer-facing web and mobile platforms"],
      ["Commerce", "Online storefronts, checkout and order management"],
      ["Internal tooling", "Dispatch, stock and reconciliation systems"],
      ["Data", "Reporting the operating companies actually use"],
    ],
    /* Software's work is the code, not a screenshot of Trading's storefront. */
    code: true,
    photo: undefined,
    alt: "",
    href: undefined,
  },
  {
    id: "ict",
    number: "05",
    label: "ICT",
    name: "Suez ICT",
    role: "Systems, connectivity & technical infrastructure",
    body:
      "The connective tissue behind the group. ICT runs connectivity, integrations, technical support and the infrastructure that keeps depots, agents, tankers, meters and payment rails talking to each other across every state the group works in.",
    facts: [
      ["Focus", "Connectivity, integrations and technical systems"],
      ["Covers", "Depots, agent kiosks, fleet and payment rails"],
      ["Works with", "Internal teams and service operations"],
      ["Contact", "Through the group office"],
    ],
    divisions: [
      ["Connectivity", "Sites, depots and kiosks kept online"],
      ["Integrations", "Disco, payment and telemetry interfaces"],
      ["Technical support", "Field and back-office support desks"],
      ["Infrastructure", "Hosting, security and continuity"],
    ],
    photo: "/photos/sectors/ict.jpg",
    alt: "Fibre patch cables terminated in a network rack",
    href: undefined,
  },
] as const;

export default function CompaniesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services & companies"
        lines={["Five companies,", "eight sectors,", "one group."]}
        lede="Gas, Trading, Electric, Software and ICT. Each has a clear job and answers for its own promises; together they cover energy, logistics, construction, facilities, distribution and technology."
        photo="/photos/filling.jpg"
        photoAlt="A technician in protective equipment operating cylinder filling equipment"
        aside={
          <dl className="space-y-4 border-l border-slate-line pl-6">
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">Companies</dt>
              <dd className="mt-1.5 text-[0.9375rem]">Gas · Trading · Electric · Software · ICT</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">Shared base</dt>
              <dd className="mt-1.5 text-[0.9375rem]">20 Alexandria Crescent, Wuse II, Abuja</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">Group since</dt>
              <dd className="mt-1.5 text-[0.9375rem]">2012</dd>
            </div>
          </dl>
        }
      />

      <section className="service-directory">
        <div className="measure">
          <div className="rail-index"><span>01</span><span>Directory</span></div>
          <div className="service-directory-heading">
            <Reveal>
              <h2 className="text-display-m">Choose the part of the network you need.</h2>
              <p>
                Gas, Trading and Electric are customer-facing businesses you can buy from today.
                Software and ICT are the digital capabilities that make the other three work.
              </p>
            </Reveal>
          </div>
          <div className="service-directory-grid">
            {SERVICES.map((service) => (
              <a key={service.id} href={`#${service.id}`} className="service-directory-card">
                <span>{service.number}</span>
                <strong>{service.label}</strong>
                <small>{service.role}</small>
                <b aria-hidden="true">↓</b>
              </a>
            ))}
          </div>
        </div>
      </section>

      {SERVICES.map((service, index) => (
        <RailSection
          key={service.id}
          index={index + 2}
          label={service.label}
          id={service.id}
          tone={index % 2 === 1 ? "paper" : "slate"}
        >
          <SectionTitle title={service.name} lede={service.role} />

          <div className="service-detail">
            <div className="service-detail-photo photo photo-frame photo-scrim photo-zoom">
              {"code" in service && service.code ? (
                <CodePanel />
              ) : (
                <Image
                  src={service.photo as string}
                  alt={service.alt}
                  fill
                  sizes="(max-width: 64rem) 90vw, 40vw"
                />
              )}
              <div className="photo-caption">
                <span>{service.label} / {service.number}</span>
                <span>{service.name}</span>
              </div>
            </div>

            <div className="service-detail-body">
              <p className="text-body-l">{service.body}</p>

              <dl className="service-facts">
                {service.facts.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="service-divisions">
                {service.divisions.map(([title, note]) => (
                  <div key={title}>
                    <strong>{title}</strong>
                    <small>{note}</small>
                  </div>
                ))}
              </div>

              {service.href ? (
                <a className="btn btn-ember mt-9" href={service.href} target="_blank" rel="noopener noreferrer">
                  Visit {service.label} <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <Link className="btn btn-ghost mt-9" href="/contact">
                  Ask about {service.label} <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
          </div>
        </RailSection>
      ))}

      <section className="service-closing">
        <div className="measure flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow">Need a route into the group?</div>
            <h2 className="mt-7 max-w-xl text-display-m">Not sure which company is yours?</h2>
          </div>
          <Link href="/contact" className="btn btn-ember">Ask the group <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </>
  );
}
