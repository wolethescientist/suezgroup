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
      "https://images.pexels.com/photos/16271901/pexels-photo-16271901.jpeg?auto=compress&cs=tinysrgb&w=1400",
    alt: "Workers handling LPG cylinders at a distribution facility",
  },
  {
    index: "02",
    label: "Digital power",
    name: "SuezElectric",
    body: "Prepaid electricity tokens, wallets and agent kiosks that make power payments easier to reach.",
    href: "https://suezelectric.com",
    image:
      "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1400&q=88",
    alt: "Power lines crossing a wide landscape at golden hour",
  },
  {
    index: "03",
    label: "Upstream logistics",
    name: "Suez Trading International",
    body: "LPG importation and road-tanker haulage for off-takers, plants and industrial customers.",
    href: "/companies#upstream",
    image:
      "https://images.unsplash.com/photo-1513828583688-c52646db42da?auto=format&fit=crop&w=1400&q=88",
    alt: "Industrial pipes and infrastructure in a warm evening light",
  },
];

const VISITOR_PATHS = [
  ["I need cooking gas", "Suez Gas Nigeria", "Cylinder refills and delivery", "https://suezgas.com"],
  ["I need electricity", "SuezElectric", "Tokens, wallets and kiosks", "https://suezelectric.com"],
  ["I supply or off-take", "Suez Trading International", "Bulk LPG and haulage", "/companies#upstream"],
  ["I am an investor or partner", "Suez Group office", "Corporate and commercial enquiries", "/contact"],
];

const MARQUEE_ITEMS = ["Cooking gas", "Digital power", "Bulk logistics", "Abuja", "One operating group"];

export default function HomePage() {
  return (
    <div className="home-page immersive-home">
      <section className="immersive-hero">
        <div className="immersive-hero-grid" aria-hidden="true" />
        <div className="immersive-hero-glow immersive-hero-glow-one" aria-hidden="true" />
        <div className="immersive-hero-glow immersive-hero-glow-two" aria-hidden="true" />

        <div className="home-container immersive-hero-inner">
          <Reveal className="immersive-hero-copy" immediate>
            <div className="immersive-kicker">
              <span>Suez Group</span>
              <span>Abuja / Nigeria</span>
            </div>
            <h1>
              <span>Energy for</span>
              <span>the everyday</span>
              <em>route.</em>
            </h1>
            <p>
              We connect the fuel, power and logistics that keep homes, businesses and cities moving.
            </p>
            <div className="immersive-actions">
              <Link href="/companies" className="immersive-button immersive-button-primary">
                Explore the group <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/contact" className="immersive-button immersive-button-quiet">
                Start a conversation <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Reveal>

          <Reveal className="immersive-hero-visual" immediate delay={180}>
            <div className="immersive-hero-visual-topline">
              <span>01 / 03</span>
              <span>Powering the everyday route</span>
            </div>
            <div className="immersive-hero-frame">
              <img src={OPERATING_LANES[1].image} alt={OPERATING_LANES[1].alt} />
              <div className="immersive-hero-frame-wash" />
              <div className="immersive-hero-frame-copy">
                <span>Built in Abuja</span>
                <strong>Reliable energy<br />needs a reliable route.</strong>
              </div>
              <div className="immersive-hero-frame-mark">
                <GroupMark className="h-8 w-auto text-ember" />
                <span>From the grid<br />to the doorstep</span>
              </div>
            </div>
            <div className="immersive-hero-orbit" aria-hidden="true"><span /><span /></div>
          </Reveal>
        </div>

        <div className="home-container immersive-hero-footer">
          <span>One group</span>
          <span>Three operating lanes</span>
          <span>Gas / electricity / haulage</span>
        </div>
      </section>

      <section className="immersive-marquee" aria-label="Suez Group operating lanes">
        <div className="immersive-marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, index) => (
            <span key={`${item}-${index}`}>{item}<i aria-hidden="true">↗</i></span>
          ))}
        </div>
      </section>

      <section className="immersive-section immersive-network">
        <div className="home-container immersive-section-intro">
          <div className="immersive-section-kicker">The group in motion</div>
          <Reveal>
            <h2>Different fronts.<br /><em>One operating rhythm.</em></h2>
            <p>
              Suez Group works across the physical and digital sides of energy access, joining the last mile to the larger route behind it.
            </p>
          </Reveal>
        </div>

        <div className="home-container immersive-lane-grid">
          <Reveal className="immersive-lane-feature">
            <img src={OPERATING_LANES[0].image} alt={OPERATING_LANES[0].alt} />
            <div className="immersive-lane-overlay" />
            <div className="immersive-lane-content">
              <span>{OPERATING_LANES[0].index} / {OPERATING_LANES[0].label}</span>
              <h3>{OPERATING_LANES[0].name}</h3>
              <p>{OPERATING_LANES[0].body}</p>
              <a href={OPERATING_LANES[0].href} target="_blank" rel="noopener noreferrer">
                Visit operating company <b aria-hidden="true">↗</b>
              </a>
            </div>
          </Reveal>

          <div className="immersive-lane-side">
            {OPERATING_LANES.slice(1).map((lane, index) => (
              <Reveal key={lane.name} className="immersive-lane-card" delay={index * 100}>
                <div className="immersive-lane-card-image">
                  <img src={lane.image} alt={lane.alt} />
                  <span>{lane.index}</span>
                </div>
                <div className="immersive-lane-card-content">
                  <span>{lane.label}</span>
                  <h3>{lane.name}</h3>
                  <p>{lane.body}</p>
                  <a href={lane.href} target={lane.href.startsWith("http") ? "_blank" : undefined} rel={lane.href.startsWith("http") ? "noopener noreferrer" : undefined}>
                    Learn more <b aria-hidden="true">↗</b>
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="immersive-bridge">
        <div className="immersive-bridge-lines" aria-hidden="true"><span /><span /><span /></div>
        <div className="home-container immersive-bridge-inner">
          <Reveal>
            <div className="immersive-section-kicker">One connected route</div>
            <h2>From the <em>cylinder</em> to the token to the tanker.</h2>
          </Reveal>
          <Reveal className="immersive-bridge-copy" delay={140}>
            <div className="immersive-bridge-route" aria-hidden="true">
              <span>Gas</span><i /><span>Power</span><i /><span>Logistics</span>
            </div>
            <p>
              The format changes. The discipline does not: clear numbers, dependable movement and a direct answer when people need help.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="immersive-section immersive-paths">
        <div className="home-container immersive-paths-grid">
          <Reveal>
            <div className="immersive-section-kicker">Find your route</div>
            <h2>Start with what brings you here.</h2>
            <p>Customers, partners and investors should all reach the right front door quickly.</p>
          </Reveal>

          <Reveal className="immersive-path-list" delay={120}>
            {VISITOR_PATHS.map(([who, company, detail, href], index) => {
              const external = href.startsWith("http");
              const content = (
                <>
                  <span className="immersive-path-number">0{index + 1}</span>
                  <span className="immersive-path-copy">
                    <strong>{who}</strong>
                    <small>{company} / {detail}</small>
                  </span>
                  <span className="immersive-path-arrow" aria-hidden="true">↗</span>
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

      <section className="immersive-cta">
        <div className="immersive-cta-grid" aria-hidden="true" />
        <div className="home-container immersive-cta-inner">
          <GroupMark className="immersive-cta-mark h-24 w-auto text-ember" />
          <Reveal>
            <div className="immersive-section-kicker">For suppliers, partners and investors</div>
            <h2>Put the right conversation in motion.</h2>
          </Reveal>
          <Link href="/contact" className="immersive-button immersive-button-light">
            Contact the group <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
