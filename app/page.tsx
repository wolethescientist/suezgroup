import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { GroupMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "Suez Group | Energy infrastructure from Abuja",
  description:
    "Suez Group connects LPG distribution, prepaid electricity and bulk energy logistics through one operating network in Abuja.",
};

const LANES = [
  {
    index: "01",
    label: "LPG distribution",
    name: "Suez Gas Nigeria",
    body: "Cooking gas for homes, estates, hospitality and commercial kitchens.",
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

export default function HomePage() {
  return (
    <div className="home-page premium-home">
      <section className="premium-hero">
        <div className="premium-hero-backdrop" aria-hidden="true">
          <img
            src={LANES[0].image}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <div className="premium-hero-light" aria-hidden="true" />
        <div className="premium-hero-wordmark" aria-hidden="true">SUEZ</div>

        <div className="home-container premium-hero-inner">
          <div className="premium-hero-topline">
            <span>Energy infrastructure</span>
            <span>Abuja / Nigeria</span>
            <span>Operating since 2012</span>
          </div>

          <Reveal className="premium-hero-copy" immediate>
            <div className="premium-kicker"><i />One operating group</div>
            <h1>Energy that <em>moves.</em></h1>
            <p>
              Suez Group connects cooking gas, electricity payments and bulk logistics through one dependable operating network.
            </p>
            <div className="premium-actions">
              <Link href="/companies" className="premium-button premium-button-primary">
                Explore the group <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/contact" className="premium-link">
                Talk to the group <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Reveal>

          <Reveal className="premium-system" immediate delay={180}>
            <div className="premium-system-header">
              <span>Operating network</span>
              <span>01 — 03</span>
            </div>
            <div className="premium-system-route" aria-hidden="true">
              <span className="is-active" />
              <i />
              <span />
              <i />
              <span />
            </div>
            <div className="premium-system-labels">
              <span>Gas</span>
              <span>Power</span>
              <span>Logistics</span>
            </div>
            <p>Different products. The same standard of movement.</p>
            <div className="premium-system-mark">
              <GroupMark className="h-8 w-auto text-ember" />
              <span>Built in Abuja<br />for everyday life</span>
            </div>
          </Reveal>
        </div>

        <div className="home-container premium-hero-bottom">
          <span>01 / The group</span>
          <span>Gas / electricity / haulage</span>
          <span className="premium-live"><i /> Network live</span>
        </div>
      </section>

      <section className="premium-chapter premium-chapter-model">
        <div className="home-container premium-model-grid">
          <div className="premium-chapter-index">01 / The operating model</div>
          <Reveal className="premium-model-copy">
            <h2>The group is the <em>route.</em></h2>
            <p>
              Suez Group sits between the source and the everyday moment: the cylinder at a doorstep, the token on a phone, the load moving down the road.
            </p>
            <div className="premium-model-foot">
              <strong>03</strong>
              <span>Operating companies<br />moving one network</span>
            </div>
          </Reveal>
          <div className="premium-route-diagram" aria-label="The Suez Group route from supply to everyday use">
            <div className="premium-route-line" />
            <div className="premium-route-node premium-route-node-one"><span>Supply</span><i /></div>
            <div className="premium-route-node premium-route-node-two"><span>Network</span><i /></div>
            <div className="premium-route-node premium-route-node-three"><span>Everyday</span><i /></div>
            <div className="premium-route-caption">A single operating rhythm<br />across three energy lanes</div>
          </div>
        </div>
      </section>

      <section className="premium-chapter premium-chapter-lanes">
        <div className="home-container premium-lanes-header">
          <div className="premium-chapter-index">02 / The operating companies</div>
          <Reveal>
            <h2>Three lanes.<br /><em>One point of view.</em></h2>
            <p>Choose a lane to see how the group reaches people, businesses and the infrastructure behind them.</p>
          </Reveal>
        </div>

        <div className="home-container premium-lane-accordion">
          {LANES.map((lane, index) => (
            <Reveal key={lane.name} as="a" className={`premium-lane-panel premium-lane-panel-${index + 1}`} href={lane.href} delay={index * 80}>
              <img src={lane.image} alt={lane.alt} loading="lazy" decoding="async" />
              <div className="premium-lane-overlay" />
              <div className="premium-lane-panel-top">
                <span>{lane.index}</span>
                <span>{lane.label}</span>
              </div>
              <div className="premium-lane-panel-bottom">
                <h3>{lane.name}</h3>
                <p>{lane.body}</p>
                <span className="premium-lane-arrow" aria-hidden="true">↗</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="premium-human">
        <div className="premium-human-image" aria-hidden="true">
          <img
            src={LANES[1].image}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="premium-human-wash" />
        <div className="home-container premium-human-inner">
          <Reveal>
            <div className="premium-kicker"><i />Close to the ground</div>
            <h2>Infrastructure is only useful when it reaches <em>someone.</em></h2>
            <p>
              We built the group around the last mile. That means making the route clear, the handoff dependable and the next step easy to find.
            </p>
          </Reveal>
          <div className="premium-human-note">
            <span>From the grid</span>
            <i />
            <span>To the doorstep</span>
          </div>
        </div>
      </section>

      <section className="premium-chapter premium-chapter-paths">
        <div className="home-container premium-paths-grid">
          <Reveal>
            <div className="premium-chapter-index">03 / Find your front door</div>
            <h2>Start with what brings you <em>here.</em></h2>
            <p>Customers, suppliers, partners and investors all have a direct route into the group.</p>
          </Reveal>
          <Reveal className="premium-path-list" delay={120}>
            {VISITOR_PATHS.map(([who, company, detail, href], index) => {
              const external = href.startsWith("http");
              const content = (
                <>
                  <span className="premium-path-number">0{index + 1}</span>
                  <span className="premium-path-copy">
                    <strong>{who}</strong>
                    <small>{company} / {detail}</small>
                  </span>
                  <span className="premium-path-arrow" aria-hidden="true">↗</span>
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

      <section className="premium-final-cta">
        <div className="premium-final-cta-glow" aria-hidden="true" />
        <div className="home-container premium-final-cta-inner">
          <GroupMark className="premium-final-mark h-24 w-auto text-ember" />
          <Reveal>
            <div className="premium-kicker"><i />For suppliers, partners and investors</div>
            <h2>Move the right conversation forward.</h2>
          </Reveal>
          <Link href="/contact" className="premium-button premium-button-light">
            Contact the group <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
