import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { GroupMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "Suez Group | Energy infrastructure from Abuja",
  description:
    "Suez Group connects LPG distribution, prepaid electricity and bulk energy logistics through one operating network in Abuja.",
};

const OPERATING_LANES = [
  {
    index: "01",
    label: "LPG distribution",
    name: "Suez Gas Nigeria",
    body: "Cooking gas for homes, estates, hospitality and commercial kitchens, delivered and weighed at the door.",
    href: "https://suezgas.com",
    image:
      "https://images.pexels.com/photos/16271901/pexels-photo-16271901.jpeg?auto=compress&cs=tinysrgb&w=1200",
    alt: "Workers handling LPG cylinders at a distribution facility",
    tone: "orange",
  },
  {
    index: "02",
    label: "Digital power",
    name: "SuezElectric",
    body: "Prepaid electricity tokens, wallets and agent kiosks that make power payments easier to reach.",
    href: "https://suezelectric.com",
    image:
      "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=85",
    alt: "Power lines crossing a wide landscape at golden hour",
    tone: "ink",
  },
  {
    index: "03",
    label: "Upstream logistics",
    name: "Suez Trading International",
    body: "LPG importation and road-tanker haulage for off-takers, plants and industrial customers.",
    href: "/companies#upstream",
    image:
      "https://images.unsplash.com/photo-1513828583688-c52646db42da?auto=format&fit=crop&w=1200&q=85",
    alt: "Industrial pipes and infrastructure in a warm evening light",
    tone: "stone",
  },
];

const VISITOR_PATHS = [
  ["I need cooking gas", "Suez Gas Nigeria", "Cylinder refills and delivery", "https://suezgas.com"],
  ["I need electricity", "SuezElectric", "Tokens, wallets and kiosks", "https://suezelectric.com"],
  ["I supply or off-take", "Suez Trading International", "Bulk LPG and haulage", "/companies#upstream"],
  ["I am an investor or partner", "Suez Group office", "Corporate and commercial enquiries", "/contact"],
];

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-image-wrap" aria-hidden="true">
          <img
            className="home-hero-image"
            src="https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1800&q=88"
            alt=""
          />
          <div className="home-hero-image-wash" />
          <div className="home-hero-image-stamp">
            <GroupMark className="h-9 w-auto text-ember" />
            <span>Energy infrastructure<br />from Abuja</span>
          </div>
        </div>

        <div className="home-container home-hero-inner">
          <Reveal className="home-hero-copy" immediate>
            <span className="home-kicker">Suez Group / Abuja, Nigeria</span>
            <h1>
              The energy people<br />
              <em>count on.</em>
            </h1>
            <p>
              Suez Group connects cooking gas, electricity payments and bulk energy logistics through one operating network.
            </p>
            <div className="home-actions">
              <Link href="/companies" className="home-button home-button-primary">
                Explore the group <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/contact" className="home-text-link">
                Talk to the group <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Reveal>

          <Reveal className="home-hero-note" immediate delay={160}>
            <div className="home-hero-note-mark">01</div>
            <p>
              We built the route first, then added the products worth sending down it.
            </p>
            <span>Operating since 2012</span>
          </Reveal>
        </div>

        <div className="home-container home-hero-bottom">
          <span>One group</span>
          <span>Three operating companies</span>
          <span>LPG / electricity / haulage</span>
        </div>
      </section>

      <section className="home-section home-section-intro">
        <div className="home-container home-intro-grid">
          <div className="home-section-label">The group at a glance</div>
          <div>
            <Reveal>
              <h2>One route. Three ways to keep everyday life moving.</h2>
              <p className="home-lede">
                From the cylinder at a doorstep to a token on a phone, Suez Group works across the physical and digital sides of energy access in Abuja.
              </p>
            </Reveal>
          </div>
        </div>

        <div className="home-container home-route-grid">
          <Reveal className="home-route-feature">
            <img src={OPERATING_LANES[0].image} alt={OPERATING_LANES[0].alt} />
            <div className="home-route-feature-overlay" />
            <div className="home-route-feature-copy">
              <span>{OPERATING_LANES[0].index} / {OPERATING_LANES[0].label}</span>
              <h3>{OPERATING_LANES[0].name}</h3>
              <p>{OPERATING_LANES[0].body}</p>
              <a href={OPERATING_LANES[0].href} target="_blank" rel="noopener noreferrer">
                Visit operating company <span aria-hidden="true">↗</span>
              </a>
            </div>
          </Reveal>

          <div className="home-route-stack">
            {OPERATING_LANES.slice(1).map((lane, index) => (
              <Reveal key={lane.name} className={`home-route-card home-route-card-${lane.tone}`} delay={index * 90}>
                <div className="home-route-card-image">
                  <img src={lane.image} alt={lane.alt} />
                </div>
                <div className="home-route-card-copy">
                  <span>{lane.index} / {lane.label}</span>
                  <h3>{lane.name}</h3>
                  <p>{lane.body}</p>
                  <a href={lane.href} target={lane.href.startsWith("http") ? "_blank" : undefined} rel={lane.href.startsWith("http") ? "noopener noreferrer" : undefined}>
                    Learn more <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-section-paths">
        <div className="home-container home-paths-grid">
          <Reveal>
            <span className="home-kicker">Find the right front door</span>
            <h2>Start with what brings you here.</h2>
            <p className="home-lede">
              Customers should reach the operating company directly. Suppliers, partners and investors can come to the group.
            </p>
          </Reveal>

          <Reveal className="home-path-list" delay={120}>
            {VISITOR_PATHS.map(([who, company, detail, href], index) => {
              const external = href.startsWith("http");
              const content = (
                <>
                  <span className="home-path-index">0{index + 1}</span>
                  <span className="home-path-copy">
                    <strong>{who}</strong>
                    <small>{company} / {detail}</small>
                  </span>
                  <span className="home-path-arrow" aria-hidden="true">↗</span>
                </>
              );
              return external ? (
                <a key={who} href={href} target="_blank" rel="noopener noreferrer">{content}</a>
              ) : (
                <Link key={who} href={href}>{content}</Link>
              );
            })}
          </Reveal>
        </div>
      </section>

      <section className="home-section home-section-proof">
        <div className="home-container home-proof-grid">
          <div className="home-proof-stat">
            <span>Since</span>
            <strong>2012</strong>
            <small>Built in Abuja, for Abuja</small>
          </div>
          <Reveal className="home-proof-copy">
            <span className="home-kicker">What holds it together</span>
            <h2>Physical supply. Digital reach.</h2>
            <p>
              The group moves between the cylinder, the token and the tanker while carrying the same operating discipline through each layer: make the number clear, make the route reliable, and answer when people need help.
            </p>
            <Link href="/about" className="home-text-link">Read about the group <span aria-hidden="true">→</span></Link>
          </Reveal>
        </div>
      </section>

      <section className="home-cta">
        <div className="home-container home-cta-inner">
          <GroupMark className="home-cta-mark h-28 w-auto text-ember" />
          <div>
            <span className="home-kicker">For suppliers, partners and investors</span>
            <h2>Let&apos;s put the right conversation in motion.</h2>
          </div>
          <Link href="/contact" className="home-button home-button-light">
            Contact the group <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
