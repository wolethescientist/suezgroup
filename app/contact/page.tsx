import type { Metadata } from "next";
import { Web } from "@/components/texture";
import { Reveal } from "@/components/reveal";
import { RouteSignal } from "@/components/energy-visuals";
import { ContactForm } from "@/components/contact-form";
import { PageHero } from "@/components/page-parts";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach Suez Group at 20 Alexandria Crescent, Wuse II, Abuja. Customers should contact the relevant operating company directly.",
};

const ROUTES = [
  {
    label: "Buying cooking gas",
    company: "Suez Gas Nigeria",
    value: "+234 816 800 3677",
    href: "tel:+2348168003677",
    note: "Call or WhatsApp, same number.",
  },
  {
    label: "Buying electricity",
    company: "SuezElectric",
    value: "+234 908 007 0070",
    href: "tel:+2349080070070",
    note: "Call or WhatsApp, same number.",
  },
  {
    label: "Everything else",
    company: "Suez Group",
    value: "info@suezgas.com",
    href: "mailto:info@suezgas.com",
    note: "Supply, partnership, investment, press.",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        lines={["Go to the right", "door first."]}
        lede="If you are buying gas or electricity, the operating company will resolve it faster than the group will. Everything else, including supply, partnership and investment, comes here."
        aside={<RouteSignal label="Group office" value="partnership / supply / capital" />}
      />

      <section className="relative overflow-hidden py-20 lg:py-28">
        <Web origin={{ x: 96, y: 30 }} nodes={160} opacity={0.75} />

        <Reveal className="measure relative">
          <div className="grid gap-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-24">
            {/* Routing */}
            <div className="reveal">
              {ROUTES.map((r, i) => (
                <div
                  key={r.label}
                  className="border-t border-slate-line py-7"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 text-[0.6875rem] uppercase tracking-[0.09em]">
                    <span className="text-ember">{r.label}</span>
                    <span className="text-fg-slate-muted">{r.company}</span>
                  </div>
                  <a
                    href={r.href}
                    className="link-slide mt-3 block font-display text-[clamp(1.25rem,2.4vw,1.75rem)] leading-tight transition-colors duration-200 hover:text-ember"
                  >
                    {r.value}
                  </a>
                  <p className="mt-3 max-w-sm text-sm text-fg-slate-muted">{r.note}</p>
                </div>
              ))}

              <div className="border-t border-slate-line py-7">
                <div className="text-[0.6875rem] uppercase tracking-[0.09em] text-fg-slate-muted">
                  Office
                </div>
                <p className="mt-3 font-display text-[clamp(1.25rem,2.4vw,1.75rem)] leading-tight">
                  20 Alexandria Crescent, Wuse II, Abuja FCT
                </p>
              </div>
            </div>

            {/* Form */}
            <Reveal className="reveal">
              <h2 className="text-display-m" style={{ "--i": 0 } as React.CSSProperties}>
                Group enquiries.
              </h2>
              <ContactForm />
            </Reveal>
          </div>
        </Reveal>
      </section>
    </>
  );
}
