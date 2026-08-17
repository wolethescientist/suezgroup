import type { Metadata } from "next";
import Link from "next/link";
import { GroupMark } from "@/components/logo";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Suez Group | Energy that keeps moving",
  description:
    "Suez Group connects cooking gas, prepaid electricity and bulk energy logistics through one dependable operating network in Nigeria.",
};

const COMPANIES = [
  {
    number: "01",
    symbol: "⌘",
    tag: "Software",
    name: "Suez Software",
    body: "Digital products and software platforms that turn the group’s operating knowledge into useful tools.",
    href: "/companies#software",
    className: "atlas-company-software",
    label: "products / platforms / tools",
  },
  {
    number: "02",
    symbol: "╱╲",
    tag: "ICT systems",
    name: "Suez ICT",
    body: "Connectivity, systems and technical infrastructure that keep people, services and information moving.",
    href: "/companies#ict",
    className: "atlas-company-ict",
    label: "systems / support / network",
  },
  {
    number: "03",
    tag: "LPG distribution",
    symbol: "◒",
    name: "Suez Gas Nigeria",
    body: "Cylinder refills, doorstep delivery and commercial LPG for the homes and businesses that keep Abuja moving.",
    href: "https://suezgas.vercel.app/",
    className: "atlas-company-gas",
    label: "cylinder / home / route",
  },
  {
    number: "04",
    symbol: "⌁",
    tag: "Upstream logistics",
    name: "Suez Trading International",
    body: "Bulk LPG importation and road-tanker haulage for off-takers, plants and industrial customers.",
    href: "/companies#trading",
    className: "atlas-company-trading",
    label: "import / tanker / volume",
  },
  {
    number: "05",
    symbol: "ϟ",
    tag: "Electric",
    name: "SuezElectric",
    body: "Prepaid electricity tokens, wallets and agent kiosks that make power payments easier to reach.",
    href: "https://suezelectric.vercel.app/",
    className: "atlas-company-power",
    label: "token / wallet / kiosk",
  },
];

const ROUTES = [
  ["I need cooking gas", "Suez Gas Nigeria", "https://suezgas.vercel.app/"],
  ["I need electricity", "SuezElectric", "https://suezelectric.vercel.app/"],
  ["I supply, invest or partner", "Suez Group", "/contact"],
];

const SOCIALS = [
  { network: "Facebook", handle: "Suez Gas Nigeria", note: "Gas delivery, safety and everyday service", href: "https://www.facebook.com/suezgasnigeria/", mark: "f" },
  { network: "Instagram", handle: "@suezelectric_", note: "Power on demand, from the network", href: "https://www.instagram.com/suezelectric_/", mark: "ig" },
  { network: "LinkedIn", handle: "SuezElectric Limited", note: "Company updates and partnerships", href: "https://www.linkedin.com/in/suezelectric-limited/", mark: "in" },
];

function ContourField() {
  return (
    <svg className="atlas-contours" viewBox="0 0 1200 720" fill="none" aria-hidden="true">
      <path d="M-40 122C134 34 231 63 343 128s179 78 282 9c104-69 196-112 337-88 125 22 180 86 278 73" />
      <path d="M-54 174c183-93 279-59 393 7 115 66 182 77 285 4 103-73 193-116 332-91 126 23 180 88 290 73" />
      <path d="M-68 231c182-96 285-56 401 9 113 63 179 75 279 4 102-72 195-119 335-92 127 24 180 91 293 74" />
      <path d="M-77 295c180-95 286-54 402 11 114 64 176 77 278 4 104-73 198-118 339-90 127 25 181 92 297 74" />
      <path d="M-84 364c181-93 285-50 399 14 115 65 177 77 280 1 101-74 198-116 339-87 128 26 185 93 303 73" />
      <path d="M-90 437c181-89 283-46 397 18 112 63 175 75 276 1 102-75 202-116 343-86 128 27 188 93 306 73" />
      <path d="M-94 515c182-89 282-42 395 19 114 62 177 73 278-3 103-76 203-113 344-83 128 28 189 93 309 72" />
      <path d="M-100 602c181-84 283-38 394 22 112 61 178 72 280-5 104-78 204-113 345-82 130 28 192 94 313 72" />
      <path className="atlas-contour-accent" d="M-32 672c178-83 280-37 389 21 115 62 182 71 284-6 101-76 203-110 344-78 130 29 193 93 315 69" />
    </svg>
  );
}

function GroupRouteMap() {
  return (
    <div className="atlas-map" aria-label="Suez Group connects gas, power and logistics">
      <svg viewBox="0 0 620 460" fill="none" aria-hidden="true">
        <path className="atlas-map-line" d="M310 205C244 142 179 103 94 81" />
        <path className="atlas-map-line" d="M310 205C378 143 449 102 526 79" />
        <path className="atlas-map-line" d="M310 227C239 287 168 334 88 371" />
        <path className="atlas-map-line" d="M310 227C380 287 452 333 532 371" />
        <circle className="atlas-map-dot" cx="94" cy="81" r="6" />
        <circle className="atlas-map-dot" cx="526" cy="79" r="6" />
        <circle className="atlas-map-dot" cx="88" cy="371" r="6" />
        <circle className="atlas-map-dot" cx="532" cy="371" r="6" />
        <circle className="atlas-map-ring" cx="310" cy="216" r="92" />
        <circle className="atlas-map-ring atlas-map-ring-small" cx="310" cy="216" r="61" />
      </svg>

      <div className="atlas-map-core">
        <GroupMark className="h-14 w-auto text-white" />
        <span>Suez Group</span>
        <small>one operating network</small>
      </div>

      <div className="atlas-map-label atlas-map-label-gas">
        <span>01 / gas</span>
        <strong>Cooking gas</strong>
        <small>cylinder / home / route</small>
      </div>
      <div className="atlas-map-label atlas-map-label-power">
        <span>02 / power</span>
        <strong>Electricity</strong>
        <small>token / wallet / kiosk</small>
      </div>
      <div className="atlas-map-label atlas-map-label-trading">
        <span>03 / upstream</span>
        <strong>Bulk haulage</strong>
        <small>import / tanker / volume</small>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="atlas-page">
      <section className="atlas-hero">
        <ContourField />
        <div className="measure atlas-hero-inner">
          <div className="atlas-hero-grid">
            <Reveal className="atlas-hero-copy" immediate>
              <div className="eyebrow">Suez Group <span>·</span> Abuja, Nigeria</div>
              <h1>Energy that <em>keeps moving.</em></h1>
              <p>
                We connect the everyday energy people rely on with the network, people and infrastructure that make it dependable.
              </p>
              <div className="atlas-actions">
                <Link href="/companies" className="btn btn-ember">Meet the companies <span aria-hidden="true">↗</span></Link>
                <Link href="/about" className="atlas-text-link">How the group works <span aria-hidden="true">→</span></Link>
              </div>
            </Reveal>

            <Reveal className="atlas-hero-visual" immediate delay={120}>
              <div className="atlas-visual-index">01 <span>the network</span></div>
              <GroupRouteMap />
              <div className="atlas-visual-note">
                <span>Supply</span><i /><span>Network</span><i /><span>Everyday</span>
              </div>
            </Reveal>
          </div>

          <div className="atlas-hero-foot">
            <span>Built in Abuja <i /> serving the moments that matter</span>
            <span className="atlas-scroll-cue"><i /> Scroll to explore</span>
          </div>
        </div>
      </section>

      <section className="atlas-intro">
        <div className="measure atlas-intro-grid">
          <div className="rail-index"><span>02</span><span>Our point of view</span></div>
          <Reveal>
            <h2>The product is only as strong as the route behind it.</h2>
            <p>
              Suez Group brings together the companies that move energy from source to street. Gas for a home. Power on a meter. Bulk supply for the infrastructure behind both.
            </p>
            <Link href="/about" className="atlas-text-link atlas-text-link-dark">Read about the group <span aria-hidden="true">→</span></Link>
          </Reveal>
          <div className="atlas-intro-stamp" aria-hidden="true">
            <span>route</span>
            <strong>before<br />product</strong>
            <i>since 2012</i>
          </div>
        </div>
      </section>

      <section className="atlas-companies">
        <div className="measure">
          <div className="atlas-section-head">
            <div className="rail-index"><span>03</span><span>Operating companies</span></div>
            <Reveal>
              <h2>Five front doors.<br /><em>One standard.</em></h2>
              <p>Go straight to the part of the network you need.</p>
            </Reveal>
          </div>

          <div className="atlas-company-grid">
            {COMPANIES.map((company, index) => (
              <Reveal key={company.name} as="a" href={company.href} className={`atlas-company-card ${company.className}`} delay={index * 90}>
                <div className="atlas-card-art" aria-hidden="true">
                  <div className="atlas-card-orbit" />
                  <span className="atlas-card-symbol">{company.symbol}</span>
                </div>
                <div className="atlas-card-top"><span>{company.number}</span><span>{company.tag}</span></div>
                <div className="atlas-card-bottom">
                  <h3>{company.name}</h3>
                  <p>{company.body}</p>
                  <span className="atlas-card-foot">{company.label} <b aria-hidden="true">↗</b></span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="atlas-proof">
        <div className="measure atlas-proof-grid">
          <Reveal className="atlas-proof-copy">
            <div className="eyebrow">The Suez difference</div>
            <h2>Make the invisible part of energy visible.</h2>
            <p>
              We believe trust starts with a number people can see: the weight on a scale, the value on a token, the route behind a delivery.
            </p>
          </Reveal>
          <Reveal className="atlas-proof-board" delay={120}>
            <div className="atlas-proof-board-label"><span>Operating principle</span><span>03 / 03</span></div>
            <div className="atlas-proof-board-word">SHOW<br /><em>THE NUMBER.</em></div>
            <div className="atlas-proof-board-meta"><span>Measured at the door</span><span>Delivered to the meter</span><span>Tracked on the road</span></div>
          </Reveal>
        </div>
      </section>

      <section className="atlas-social">
        <div className="measure atlas-social-grid">
          <Reveal>
            <div className="rail-index"><span>04</span><span>Social / in the field</span></div>
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

      <section className="atlas-paths">
        <div className="measure atlas-paths-grid">
          <Reveal>
            <div className="rail-index"><span>05</span><span>Find your front door</span></div>
            <h2>Start with what brings you <em>here.</em></h2>
            <p>Customers, suppliers, partners and investors all have a direct route into the group.</p>
          </Reveal>
          <Reveal className="atlas-route-list" delay={110}>
            {ROUTES.map(([label, company, href], index) => {
              const external = href.startsWith("http");
              const content = <><span className="atlas-route-number">0{index + 1}</span><span><strong>{label}</strong><small>{company}</small></span><b aria-hidden="true">↗</b></>;
              return external ? <a key={label} href={href} target="_blank" rel="noopener noreferrer">{content}</a> : <Link key={label} href={href}>{content}</Link>;
            })}
          </Reveal>
        </div>
      </section>

      <section className="atlas-cta">
        <ContourField />
        <div className="measure atlas-cta-inner">
          <GroupMark className="atlas-cta-mark h-20 w-auto text-white" />
          <Reveal>
            <div className="eyebrow">For suppliers, partners and investors</div>
            <h2>Let&apos;s move the right conversation forward.</h2>
          </Reveal>
          <Link href="/contact" className="btn atlas-btn-light">Contact the group <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </div>
  );
}
