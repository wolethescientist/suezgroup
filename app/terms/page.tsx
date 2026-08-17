import type { Metadata } from "next";
import { PageHero, RailSection } from "@/components/page-parts";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms of use for the Suez Group website.",
};

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        lines={["A clear set of terms."]}
        lede="The Suez Group website helps customers, suppliers and partners find the right operating company."
      />
      <RailSection index={1} label="Use">
        <div className="prose-copy max-w-2xl">
          <h2>Information on this site</h2>
          <p>We aim to keep the information current, but website content is general information and is not a contract, quotation or guarantee of availability.</p>
          <h2>Separate companies</h2>
          <p>Suez Group is a trading name for the companies listed on this site. Each operating company remains responsible for its own products, services and agreements.</p>
          <h2>External links</h2>
          <p>External websites are provided as a route to the relevant company. Their content and terms are controlled by their respective operators.</p>
        </div>
      </RailSection>
    </>
  );
}
