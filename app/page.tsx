import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CodePanel } from "@/components/code-panel";
import { GroupMark } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { SectorCaption, SectorCycle, SectorFrames, SectorNote } from "@/components/sector-stage";

export const metadata: Metadata = {
  title: "Suez Group | Energy, logistics, infrastructure and technology",
  description:
    "Suez Group operates across energy supply, haulage and logistics, construction, facility services, FMCG distribution, prepaid power and software — nationwide from Abuja, Nigeria.",
};

/** Group-level figures. Every number below is carried by one of the operating sites. */
const FIGURES = [
  { value: "2012", label: "Operating since", note: "Suez Gas Nigeria incorporated in Abuja" },
  { value: "Five", label: "Companies", note: "Gas · Trading · Electric · Software · ICT" },
  { value: "36", label: "States served", note: "Nationwide supply and delivery" },
  { value: "11", label: "Discos connected", note: "Sokoto to Port Harcourt, prepaid" },
  { value: "14s", label: "Median token time", note: "Paid to delivered on SuezElectric" },
];

/**
 * The group is not an LPG business with side projects — it is a general trading,
 * energy and services group. These eight sectors are the honest span of it,
 * drawn from what each operating company actually sells today.
 */
const SECTORS = [
  {
    n: "01",
    name: "Energy supply",
    body: "Bulk and retail supply of LPG, AGO, PMS, DPK and lubricants — from a 3kg cylinder to a full road tanker.",
    by: "Gas · Trading",
  },
  {
    n: "02",
    name: "Oil & gas field services",
    body: "Upstream and midstream support for operators, plants and terminals working across the value chain.",
    by: "Trading",
  },
  {
    n: "03",
    name: "Haulage & logistics",
    body: "Tanker haulage and general freight, contracted by volume, with a typical 24–72 hour delivery window.",
    by: "Gas · Trading",
  },
  {
    n: "04",
    name: "Construction & civil works",
    body: "Roads, bridges and building projects, delivered with the group's own supply and haulage behind them.",
    by: "Trading",
  },
  {
    n: "05",
    name: "General supplies",
    body: "Building materials, merchandise and procurement for corporate, institutional and government buyers.",
    by: "Trading",
  },
  {
    n: "06",
    name: "Facility & environmental",
    body: "Waste management, landscaping and site upkeep for estates, plants and commercial premises.",
    by: "Trading",
  },
  {
    n: "07",
    name: "FMCG distribution",
    body: "Fast-moving consumer goods moved down routes the group already runs every day.",
    by: "Trading",
  },
  {
    n: "08",
    name: "Power & technology",
    body: "Prepaid electricity vending, digital products and the ICT systems that hold the whole network together.",
    by: "Electric · Software · ICT",
  },
];

const COMPANIES: {
  number: string;
  tag: string;
  name: string;
  body: string;
  href: string;
  /** Every company but Software is carried by a photograph. */
  photo?: string;
  alt: string;
  meta: string;
  position?: string;
  screen?: boolean;
  /** Software's work is the code, so its card renders code instead of a photo. */
  code?: boolean;
}[] = [
  {
    number: "01",
    tag: "LPG distribution",
    name: "Suez Gas Nigeria",
    body: "Cylinder refills from 3kg to 50kg, doorstep pick-up and return, bulk supply, tank telemetry and professional installation for the homes, estates, hotels and bakeries that keep Abuja running.",
    href: "https://suezgas.vercel.app/",
    photo: "/photos/filling.jpg",
    alt: "A technician in full protective equipment operating cylinder filling equipment at a Suez Gas plant",
    meta: "RC 1076785 · since 2012",
  },
  {
    number: "02",
    tag: "General trading & services",
    name: "Suez Trading Internationale",
    body: "Seven divisions across one value chain — petroleum products, oilfield services, haulage, construction, general supplies, facility services and FMCG distribution — delivered nationwide from Abuja.",
    href: "https://suez-trading.vercel.app/",
    photo: "/photos/logistics.jpg",
    alt: "Container handlers moving freight across a loading terminal",
    meta: "7 divisions · 36 states",
  },
  {
    number: "03",
    tag: "Prepaid electricity",
    name: "SuezElectric",
    body: "Prepaid tokens generated on demand across eleven distribution companies, with a wallet, an agent network and a receipt that survives an argument with a landlord.",
    href: "https://suezelectric.vercel.app/",
    photo: "/platforms/suezelectric.jpg",
    /* Crop to the live token panel rather than the headline — the product, not the page. */
    position: "76% 46%",
    screen: true,
    alt: "The SuezElectric platform showing a prepaid electricity token delivered in fourteen seconds",
    meta: "RC 1638998 · since 2020",
  },
  {
    number: "04",
    tag: "Digital products",
    name: "Suez Software",
    body: "The group's product layer. It builds the storefronts, vending platforms and internal tools that turn fourteen years of operating knowledge into software the rest of the network runs on.",
    href: "/companies#software",
    code: true,
    alt: "",
    meta: "Platforms · storefronts · tools",
  },
  {
    number: "05",
    tag: "Systems & infrastructure",
    name: "Suez ICT",
    body: "Connectivity, integrations and technical infrastructure. The lane that keeps depots, agents, tankers and payment rails talking to each other across every state the group works in.",
    href: "/companies#ict",
    /* ICT is connectivity, not a tank farm — the network rack, not the terminal. */
    photo: "/photos/sectors/ict.jpg",
    alt: "Fibre patch cables terminated in a network rack",
    meta: "Networks · integrations · support",
  },
];

const COVERAGE = [
  "Abuja FCT",
  "Lagos",
  "Kano",
  "Rivers",
  "Kaduna",
  "Sokoto",
  "Enugu",
  "Oyo",
  "Delta",
  "Borno",
  "Plateau",
  "+25 more states",
];

const PARTNERS = [
  { name: "Nigerian Midstream and Downstream Petroleum Regulatory Authority", file: "nmdpra" },
  { name: "Nigerian Upstream Petroleum Regulatory Commission", file: "nuprc" },
  { name: "Rotarex SRG", file: "rotarex" },
  { name: "NPSC", file: "npsc" },
  { name: "Ashfar", file: "ashfar" },
  { name: "Suez Gas Nigeria", file: "suezgas" },
  { name: "SuezElectric", file: "suezelectric" },
];

const ROUTES = [
  ["I need cooking gas", "Suez Gas Nigeria", "https://suezgas.vercel.app/"],
  ["I need electricity units", "SuezElectric", "https://suezelectric.vercel.app/"],
  ["I need supplies, haulage or a contractor", "Suez Trading Internationale", "https://suez-trading.vercel.app/"],
  ["I supply, invest or partner", "Suez Group", "/contact"],
];

const SOCIALS = [
  { network: "Facebook", handle: "Suez Gas Nigeria", note: "Gas delivery, safety and everyday service", href: "https://www.facebook.com/suezgasnigeria/", mark: "f" },
  { network: "Instagram", handle: "@suezelectric_", note: "Power on demand, from the network", href: "https://www.instagram.com/suezelectric_/", mark: "ig" },
  { network: "LinkedIn", handle: "SuezElectric Limited", note: "Company updates, partnerships and tenders", href: "https://www.linkedin.com/in/suezelectric-limited/", mark: "in" },
];

export default function HomePage() {
  return (
    <div className="atlas-page">
      {/* ---------------------------------------------------------------- 01 */}
      <SectorCycle>
      <section className="atlas-hero">
        <SectorFrames tone="hero" />

        <div className="measure atlas-hero-inner">
          <Reveal className="atlas-hero-copy" immediate>
            <div className="eyebrow">Suez Group <span>·</span> Abuja, Nigeria</div>
            <h1>An energy, logistics and technology group.</h1>
            <p>
              Five companies working out of Abuja: LPG and fuel supply, haulage, construction,
              facility services, FMCG distribution, prepaid electricity and software. We have been
              trading since 2012 and deliver to all 36 states.
            </p>
            <div className="atlas-actions">
              <Link href="/companies" className="btn btn-ember">Our companies <span aria-hidden="true">↗</span></Link>
              <Link href="/about" className="atlas-text-link">About the group <span aria-hidden="true">→</span></Link>
            </div>
          </Reveal>

          {/* The five companies, cycling: a photograph and its write-up per company. */}
          <div className="atlas-hero-stage">
            <div className="atlas-hero-sectors">
              <span>Energy supply</span>
              <span>Haulage &amp; logistics</span>
              <span>Construction</span>
              <span>Facility services</span>
              <span>FMCG</span>
              <span>Prepaid power</span>
              <span>Software &amp; ICT</span>
            </div>
            <SectorNote />
          </div>

          <div className="atlas-hero-foot">
            <span>Abuja, Nigeria <i /> since 2012 <i /> 36 states</span>
            <span className="atlas-scroll-cue"><i /> Scroll</span>
          </div>
        </div>
      </section>
      </SectorCycle>

      {/* ---------------------------------------------------------------- 02 */}
      <section className="atlas-figures">
        <div className="measure">
          <div className="atlas-figures-grid">
            {FIGURES.map((figure) => (
              <div key={figure.label} className="atlas-figure">
                <strong>{figure.value}</strong>
                <span>{figure.label}</span>
                <small>{figure.note}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 03 */}
      <section className="atlas-intro">
        <div className="measure atlas-intro-grid">
          <div className="rail-index"><span>01</span><span>Our point of view</span></div>
          <Reveal>
            <h2>A group is only as good as the link you never see.</h2>
            <p>
              Most of what Suez Group does happens before anyone notices it. The tanker that
              arrives at 4am. The materials on site the morning work starts. The token that lands
              while the kettle is still cold. The route that made all three affordable.
            </p>
            <p>
              We started in 2012 with one LPG distributor learning Abuja street by street. The
              companies that followed were built on the same asset: a physical network we own,
              staff and answer for — and now a digital one that reaches every state.
            </p>
            <Link href="/about" className="atlas-text-link atlas-text-link-dark">Read about the group <span aria-hidden="true">→</span></Link>
          </Reveal>
          <Reveal className="atlas-intro-photo photo photo-frame photo-scrim photo-zoom" delay={120}>
            <Image
              src="/photos/haulage.jpg"
              alt="A road tanker in the group's haulage fleet"
              fill
              sizes="(max-width: 64rem) 90vw, 28rem"
            />
            <div className="photo-caption"><span>Haulage &amp; logistics</span><span>By volume, by contract</span></div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 04 */}
      <section className="atlas-sectors">
        <div className="measure">
          <div className="atlas-section-head">
            <div className="rail-index"><span>02</span><span>What the group does</span></div>
            <Reveal>
              <h2>Eight sectors, <em>one operating spine.</em></h2>
              <p>
                Suez Group is a general trading, energy and services group. The same depots,
                vehicles, people and systems carry all eight of these — which is why the group can
                quote a bulk fuel contract and a facility contract in the same week.
              </p>
            </Reveal>
          </div>

          <div className="atlas-sector-grid">
            {SECTORS.map((sector, i) => (
              <Reveal key={sector.name} className="atlas-sector" delay={i * 55}>
                <span>{sector.n}</span>
                <strong>{sector.name}</strong>
                <small>{sector.body}</small>
                <em>{sector.by}</em>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 05 */}
      <section className="atlas-companies">
        <div className="measure">
          <div className="atlas-section-head">
            <div className="rail-index"><span>03</span><span>Operating companies</span></div>
            <Reveal>
              <h2>Five front doors.<br /><em>One standard.</em></h2>
              <p>Each company runs its own business and answers for its own promises. Go straight to the one you need.</p>
            </Reveal>
          </div>

          <div className="atlas-company-grid">
            {COMPANIES.map((company, index) => {
              const external = company.href.startsWith("http");
              return (
                <Reveal
                  key={company.name}
                  as="a"
                  href={company.href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="atlas-company-card"
                  delay={index * 80}
                >
                  <div
                    className={`atlas-company-photo${company.screen ? " is-screen" : ""}${
                      company.code ? " is-code" : ""
                    }`}
                  >
                    {company.code ? (
                      <CodePanel />
                    ) : (
                      <Image
                        src={company.photo as string}
                        alt={company.alt}
                        fill
                        sizes="(max-width: 64rem) 100vw, 50vw"
                        style={company.position ? { objectPosition: company.position } : undefined}
                      />
                    )}
                  </div>
                  <div className="atlas-card-top"><span>{company.number}</span><span>{company.tag}</span></div>
                  <div className="atlas-card-bottom">
                    <h3>{company.name}</h3>
                    <p>{company.body}</p>
                    <span className="atlas-card-foot">{company.meta} <b aria-hidden="true">↗</b></span>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 06 */}
      <section className="atlas-product">
        <div className="measure atlas-product-grid">
          <Reveal>
            <div className="eyebrow">In the field <span>·</span> Own-brand product</div>
            <h2>The SRG smart regulator.</h2>
            <p>
              Built with Rotarex SRG and sold through Suez Trading, it puts a pressure gauge and
              leak check on the outside of the cylinder — so a household can see what it has left
              and whether the seal is sound, without calling anybody.
            </p>
            <dl className="atlas-product-list">
              <div><dt>Built in</dt><dd>Leak detection and pressure monitoring on the regulator body</dd></div>
              <div><dt>Fits</dt><dd>Standard 3kg to 50kg domestic and commercial cylinders</dd></div>
              <div><dt>Sold through</dt><dd>Suez Trading online store, with nationwide delivery</dd></div>
              <div><dt>Price</dt><dd>₦10,000 — order online or by bulk quote</dd></div>
            </dl>
            <a href="https://suez-trading.vercel.app/" target="_blank" rel="noopener noreferrer" className="btn btn-ember mt-9">Shop the SRG regulator <span aria-hidden="true">↗</span></a>
          </Reveal>

          <Reveal className="atlas-product-photos" delay={120}>
            <div className="photo photo-frame photo-zoom">
              <Image src="/photos/srg-regulator.jpg" alt="The Suez SRG smart gas regulator with its built-in pressure and leak-check gauge" fill sizes="(max-width: 64rem) 90vw, 40vw" />
            </div>
            {/* The second frame is where the regulator ends up, not the same
                studio shot a second time. */}
            <div className="photo photo-frame photo-zoom">
              <Image src="/photos/kitchen.jpg" alt="A commercial kitchen burner running on cylinder gas" fill sizes="(max-width: 64rem) 45vw, 20vw" />
            </div>
            <div className="atlas-product-spec">
              <span>Safety</span>
              <strong>Leak<br />check</strong>
              <small>On the gauge, not in a manual</small>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 07 */}
      <section className="atlas-coverage">
        <div className="measure atlas-coverage-grid">
          <Reveal>
            <div className="rail-index"><span>04</span><span>Reach</span></div>
            <h2>Abuja-based. <em>Nationwide.</em></h2>
            <p>
              Physical supply and haulage run from Abuja to thirty-six states on a typical 24–72
              hour window. Prepaid power reaches further still — eleven distribution companies,
              Sokoto to Port Harcourt, wherever there is a meter and a phone.
            </p>
            <div className="atlas-coverage-list">
              {COVERAGE.map((place) => <span key={place}>{place}</span>)}
            </div>
          </Reveal>
          <Reveal className="atlas-coverage-photo photo photo-frame photo-scrim photo-zoom" delay={120}>
            <Image src="/photos/logistics.jpg" alt="Freight moving across a distribution terminal" fill sizes="(max-width: 64rem) 90vw, 45vw" />
            <div className="photo-caption"><span>24–72 hour window</span><span>36 states</span></div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 08 */}
      <section className="atlas-partners">
        <div className="measure">
          <div className="atlas-partners-head">
            <div className="eyebrow">Regulators, partners and brands</div>
            <p>The group operates under Nigerian petroleum regulation and builds with manufacturers whose equipment carries our name.</p>
          </div>
          <div className="atlas-partner-row">
            {PARTNERS.map((partner) => (
              <div key={partner.file} className="atlas-partner">
                <Image src={`/partners/${partner.file}.jpg`} alt={partner.name} width={340} height={110} sizes="9rem" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 09 */}
      <section className="atlas-proof">
        <div className="measure atlas-proof-grid">
          <Reveal className="atlas-proof-copy">
            <div className="eyebrow">The Suez difference</div>
            <h2>Make the invisible part visible.</h2>
            <p>
              Short-measured cylinders and unexplained bills are the two complaints that define
              this industry. Both are solved the same way — by showing the customer the number
              instead of asserting it.
            </p>
          </Reveal>
          <Reveal className="atlas-proof-board" delay={120}>
            <div className="photo">
              <Image src="/photos/terminal.jpg" alt="A petroleum storage terminal at dusk" fill sizes="(max-width: 64rem) 90vw, 55vw" />
            </div>
            <div className="atlas-proof-board-label"><span>Operating principle</span><span>01 / 01</span></div>
            <div className="atlas-proof-board-word">SHOW<br /><em>THE NUMBER.</em></div>
            <div className="atlas-proof-board-meta"><span>Weighed at the door</span><span>Delivered to the meter</span><span>Tracked on the road</span></div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 10 */}
      <section className="atlas-social">
        <div className="measure atlas-social-grid">
          <Reveal>
            <div className="rail-index"><span>05</span><span>Social / in the field</span></div>
            <h2>Signal from the <em>network.</em></h2>
            <p>Follow the people, products and conversations moving through the Suez network.</p>
          </Reveal>
          <Reveal className="atlas-social-wall" delay={110}>
            {SOCIALS.map((social, index) => (
              <a key={social.network} href={social.href} target="_blank" rel="noopener noreferrer" className={`atlas-social-card atlas-social-card-${index + 1}`}>
                <span className="atlas-social-mark">{social.mark}</span>
                <span className="atlas-social-network">{social.network}</span>
                <strong>{social.handle}</strong>
                <small>{social.note}</small>
                <b aria-hidden="true">↗</b>
              </a>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 11 */}
      <section className="atlas-paths">
        <div className="measure atlas-paths-grid">
          <Reveal>
            <div className="rail-index"><span>06</span><span>Find your front door</span></div>
            <h2>Start with what brings you <em>here.</em></h2>
            <p>Customers, contractors, suppliers, partners and investors all have a direct route into the group.</p>
          </Reveal>
          <Reveal className="atlas-route-list" delay={110}>
            {ROUTES.map(([label, company, href], index) => {
              const external = href.startsWith("http");
              const content = <><span className="atlas-route-number">0{index + 1}</span><span><strong>{label}</strong><small>{company}</small></span><b aria-hidden="true">↗</b></>;
              return external
                ? <a key={label} href={href} target="_blank" rel="noopener noreferrer">{content}</a>
                : <Link key={label} href={href}>{content}</Link>;
            })}
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 12 */}
      <SectorCycle interval={9000}>
      <section className="atlas-cta">
        <SectorFrames tone="band" />
        <div className="measure atlas-cta-inner">
          <GroupMark className="atlas-cta-mark h-20 w-auto" />
          <Reveal>
            <div className="eyebrow">For customers, contractors, suppliers and investors</div>
            <h2>Let&apos;s move the right conversation forward.</h2>
          </Reveal>
          <Link href="/contact" className="btn atlas-btn-light">Contact the group <span aria-hidden="true">↗</span></Link>
          <SectorCaption className="atlas-cta-caption" />
        </div>
      </section>
      </SectorCycle>
    </div>
  );
}
