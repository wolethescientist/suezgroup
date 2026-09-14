import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Strata, Web } from "@/components/texture";
import { Reveal } from "@/components/reveal";
import { RouteSignal } from "@/components/energy-visuals";
import {
  PageHero,
  PullQuote,
  RailSection,
  SectionTitle,
  StatRow,
} from "@/components/page-parts";

export const metadata: Metadata = {
  title: "About the group",
  description:
    "How Suez Group grew from a single Abuja LPG distributor in 2012 into a general trading, energy, services and technology group working across thirty-six states.",
};

const TIMELINE = [
  [
    "2012",
    "Suez Gas Nigeria incorporated",
    "Registered on 7 November 2012 in Abuja as a petroleum products sales and distribution business, operating from Wuse II. One product, one city, one van.",
  ],
  [
    "2012 – 2017",
    "The route gets built",
    "Years of cooking gas deliveries into the same estates, hotels, bars, eateries and bakeries. Not a growth story so much as a logistics one — learning a city street by street until the network itself became the asset.",
  ],
  [
    "2018",
    "Suez Trading Internationale incorporated",
    "The group stops being an LPG business. Trading opens seven divisions across petroleum supply, oilfield services, haulage, construction, general supplies, facility services and FMCG — and takes the network national, to thirty-six states.",
  ],
  [
    "2020",
    "SuezElectric incorporated",
    "A digital product sold down a route already built. The prepaid electricity platform goes live in December 2020 on iOS, Android and web, and now reaches eleven distribution companies.",
  ],
  [
    "Today",
    "Five companies, eight sectors",
    "Gas, Trading and Electric carry the network to customers. Software builds the platforms they run on, and ICT keeps every part of it connected.",
  ],
];

const BAND = [
  { src: "/photos/team.jpg", alt: "A Suez Gas crew weighing a cylinder at the point of delivery", caption: ["Abuja", "Weighed at the door"] },
  { src: "/photos/haulage.jpg", alt: "A road tanker in the group's haulage fleet", caption: ["Haulage", "Contracted by volume"] },
  { src: "/photos/logistics.jpg", alt: "Freight moving across a distribution terminal", caption: ["Distribution", "36 states"] },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About the group"
        lines={["Built route first,", "products second."]}
        lede="Most trading groups start with a product and hunt for customers. Suez Group started with a delivery network in Abuja and kept adding things worth sending down it — gas, fuel, materials, freight, civil works and, eventually, electricity itself."
        cycle
        aside={<RouteSignal label="Operating thesis" value="route before product" />}
      />

      {/* 01 Timeline */}
      <RailSection index={1} label="History">
        <SectionTitle title="Fourteen years, in five parts." />
        <Reveal className="reveal mt-14">
          {TIMELINE.map(([year, title, body], i) => (
            <div
              key={title}
              className="grid gap-4 border-t border-slate-line py-9 sm:grid-cols-[9rem_1fr] sm:gap-10 lg:grid-cols-[9rem_1fr_1.4fr]"
              style={{ "--i": i } as React.CSSProperties}
            >
              <div className="font-mono text-[0.8125rem] text-ember">{year}</div>
              <h3 className="text-display-s">{title}</h3>
              <p className="max-w-xl text-fg-slate-muted">{body}</p>
            </div>
          ))}
        </Reveal>
      </RailSection>

      {/* Photo band */}
      <div className="photo-band">
        {BAND.map((shot) => (
          <div key={shot.src} className="photo photo-scrim photo-zoom">
            <Image src={shot.src} alt={shot.alt} fill sizes="(max-width: 64rem) 100vw, 33vw" />
            <div className="photo-caption">
              <span>{shot.caption[0]}</span>
              <span>{shot.caption[1]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 02 What we believe */}
      <RailSection index={2} label="Principles" tone="paper">
        <PullQuote attribution="The group's operating principle">
          Sell the customer a number they can verify. A cylinder weighed at the
          door, a token delivered in seconds, a load signed for on arrival, a
          receipt that survives an argument with a landlord.
        </PullQuote>

        <div className="reveal mt-16 grid gap-x-14 gap-y-10 md:grid-cols-2">
          {[
            [
              "Measurement is the product",
              "Short-measured cylinders, unexplained bills and light loads are the complaints that define these industries. All three are solved by showing the customer the number, not asserting it.",
            ],
            [
              "Answer the phone",
              "A failed delivery or an undelivered token at 11pm is not a support ticket. Every operating company runs a phone line and WhatsApp on the same number, staffed by people.",
            ],
            [
              "Own the last mile",
              "Own vehicles, own drivers, own agents. Where the network thins out at the edge of the metropolis, kiosk agents carry it rather than a courier contract.",
            ],
            [
              "One spine, many products",
              "The same depots, fleet, people and systems carry gas, fuel, materials, freight and FMCG. That is why the group can quote a bulk fuel contract and a facility contract in the same week.",
            ],
            [
              "Build the software ourselves",
              "Generic systems do not understand the route. Suez Software builds the vending, commerce and dispatch tools in-house so the operating knowledge stays inside the group.",
            ],
            [
              "Lower the impact",
              "LPG and prepaid metering both reduce waste: cleaner cooking than solid fuel, and consumption people can actually see and manage.",
            ],
          ].map(([title, body], i) => (
            <div
              key={title}
              className="border-t border-paper-line pt-6"
              style={{ "--i": i } as React.CSSProperties}
            >
              <h3 className="text-display-s">{title}</h3>
              <p className="mt-3 max-w-md text-fg-paper-muted">{body}</p>
            </div>
          ))}
        </div>
      </RailSection>

      {/* 03 Facts */}
      <section className="relative overflow-hidden border-t border-slate-line py-20 lg:py-28">
        <Strata tone="slate" opacity={0.55} />
        <Reveal className="measure relative">
          <div className="rail">
            <div className="rail-index">
              <span>
                03
                <span className="mt-1.5 block opacity-70">Group facts</span>
              </span>
            </div>
            <div>
              <SectionTitle
                title="The group on paper."
                lede="Gas, Trading and Electric are operating businesses with their own registrations and their own customers. Software and ICT are the digital capabilities connecting them."
              />
              <div className="reveal mt-14">
                <StatRow
                  items={[
                    { label: "Operating companies", value: "Five", note: "Gas · Trading · Electric · Software · ICT" },
                    { label: "Sectors covered", value: "Eight", note: "Energy, logistics, works, facilities, FMCG, tech" },
                    { label: "States served", value: "36", note: "Typical 24–72 hour delivery window" },
                    { label: "Discos connected", value: "11", note: "Sokoto to Port Harcourt, prepaid" },
                    { label: "Suez Gas Nigeria", value: "RC 1076785", note: "Incorporated 2012" },
                    { label: "SuezElectric", value: "RC 1638998", note: "Platform live 2020" },
                    { label: "Registered base", value: "Wuse II", note: "20 Alexandria Crescent, Abuja" },
                    { label: "Trading base", value: "Jabi", note: "6 I. E. Madubuike Close, Abuja" },
                  ]}
                />
              </div>
              <p className="reveal mt-12 max-w-2xl text-[0.6875rem] uppercase leading-relaxed tracking-[0.075em] text-fg-slate-muted">
                Suez Group is a trading name describing the network collectively.
                Legal responsibility for products, services and agreements remains
                with the relevant operating business.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="relative overflow-hidden border-t border-slate-line py-20 lg:py-24">
        <Web origin={{ x: 24, y: 50 }} nodes={150} opacity={0.7} />
        <Reveal className="measure relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-xl text-display-m">
            See what each company actually does.
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/companies" className="btn btn-ember">Our companies</Link>
            <Link href="/contact" className="btn btn-ghost">Contact</Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
