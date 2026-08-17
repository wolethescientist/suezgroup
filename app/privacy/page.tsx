import type { Metadata } from "next";
import { PageHero, RailSection } from "@/components/page-parts";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "Privacy notice for the Suez Group website.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        lines={["Privacy, plainly stated."]}
        lede="This website is a corporate information and routing site for Suez Group and its operating companies."
      />
      <RailSection index={1} label="Notice">
        <div className="prose-copy max-w-2xl">
          <h2>Information you send us</h2>
          <p>The contact form prepares an email addressed to info@suezgas.com in your email application. The website does not store the form contents in a database.</p>
          <h2>External websites</h2>
          <p>Links to Suez Gas Nigeria and SuezElectric take you to separately operated websites. Their own privacy notices apply there.</p>
          <h2>Questions</h2>
          <p>For privacy questions, contact <a href="mailto:info@suezgas.com">info@suezgas.com</a>.</p>
        </div>
      </RailSection>
    </>
  );
}
