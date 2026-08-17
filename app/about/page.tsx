import type { Metadata } from "next";
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
    "How Suez Group grew from a single LPG distributor in 2012 into a connected network spanning Software, ICT, Gas, Trading and Electric services.",
};

const TIMELINE = [
  [
    "2012",
    "Suez Gas Nigeria incorporated",
    "Registered on 7 November 2012 in Abuja as a petroleum products sales and distribution business, operating from Wuse II.",
  ],
  [
    "2012 - 2019",
    "The route gets built",
    "Years of cooking gas deliveries into the same estates, hotels, bars, eateries and bakeries. Not a growth story so much as a logistics one, learning a city street by street.",
  ],
  [
    "2020",
    "SuezElectric incorporated",
    "A second product sold down the route already built. The prepaid electricity platform goes live in December 2020 on iOS, Android and web.",
  ],
  [
    "Today",
    "Five lanes, one network",
    "Software and ICT support the group’s digital layer; Trading, Gas and Electric carry the network into homes, businesses and infrastructure.",
  ],
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About the group"
        lines={["Built route first,", "products second."]}
        lede="Most energy retail starts with a product and hunts for customers. Suez Group started with a delivery network in Abuja and added the things worth sending down it."
        aside={<RouteSignal label="Operating thesis" value="route before product" />}
      />

      {/* 01 Timeline */}
      <RailSection index={1} label="History">
        <SectionTitle title="Fourteen years, in four parts." />
        <Reveal className="reveal mt-14">
          {TIMELINE.map(([year, title, body], i) => (
            <div
              key={title}
              className="grid gap-4 border-t border-slate-line py-9 sm:grid-cols-[8rem_1fr] sm:gap-10 lg:grid-cols-[8rem_1fr_1.4fr]"
              style={{ "--i": i } as React.CSSProperties}
            >
              <div className="font-mono text-[0.8125rem] text-ember">{year}</div>
              <h3 className="text-display-s">{title}</h3>
              <p className="max-w-xl text-fg-slate-muted">{body}</p>
            </div>
          ))}
        </Reveal>
      </RailSection>

      {/* 02 What we believe (paper) */}
      <RailSection index={2} label="Principles" tone="paper">
        <PullQuote attribution="The group's operating principle">
          Sell the customer a number they can verify. A cylinder weighed at the
          door, a token delivered in seconds, a receipt that survives an argument
          with a landlord.
        </PullQuote>

        <div className="reveal mt-16 grid gap-x-14 gap-y-10 md:grid-cols-2">
          {[
            [
              "Measurement is the product",
              "Short-measured cylinders and unexplained bills are the two complaints that define this industry. Both are solved by showing the customer the number, not asserting it.",
            ],
            [
              "Answer the phone",
              "A failed delivery or an undelivered token at 11pm is not a support ticket. Both companies run a phone line and WhatsApp on the same number, staffed by people.",
            ],
            [
              "Own the last mile",
              "Own vehicles, own drivers, own agents. Where the network thins out at the edge of the metropolis, kiosk agents carry it rather than a courier contract.",
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
                lede="The group works across five lanes. Gas, Electric and Trading are operating businesses; Software and ICT are the digital capabilities connecting the network."
              />
              <div className="reveal mt-14">
                <StatRow
                  items={[
                    { label: "Service lanes", value: "Five", note: "Software · ICT · Gas · Trading · Electric" },
                    { label: "Suez Gas Nigeria", value: "RC 1076785", note: "Incorporated 2012" },
                    { label: "SuezElectric", value: "RC 1638998", note: "Platform live 2020" },
                    { label: "Registered base", value: "Wuse II", note: "20 Alexandria Crescent, Abuja" },
                    { label: "Standing advisers", value: "Three", note: "Technical, technology, advisory" },
                  ]}
                />
              </div>
              <p
                className="reveal mt-12 max-w-2xl text-[0.6875rem] uppercase leading-relaxed tracking-[0.075em] text-fg-slate-muted"
              >
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
            <Link href="/companies" className="btn btn-ember">
              Our companies
            </Link>
            <Link href="/contact" className="btn btn-ghost">
              Contact
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
