import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Grain } from "@/components/texture";
import { MarketRibbon } from "@/components/market-ribbon";
import { SiteChat } from "@/components/site-chat";

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "Suez Group - Energy, logistics, infrastructure and technology",
    template: "%s - Suez Group",
  },
  description:
    "Suez Group operates across energy supply, haulage and logistics, construction, facility services, FMCG distribution, prepaid power and software - nationwide from Abuja, Nigeria.",
  openGraph: {
    title: "Suez Group - Energy, logistics, infrastructure and technology",
    description:
    "Five companies across eight sectors: LPG, petroleum supply, haulage, construction, facilities, FMCG, prepaid power, software and ICT.",
    type: "website",
    locale: "en_NG",
    images: [{ url: "/photos/team.jpg", width: 1200, height: 1000, alt: "A Suez Gas crew weighing a cylinder at the point of delivery in Abuja" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Suez Group - Energy, logistics, infrastructure and technology",
    description: "Five companies across eight sectors, nationwide from Abuja.",
    images: ["/photos/team.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1315",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-NG" className={mono.variable}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-ember focus:px-4 focus:py-2 focus:text-xs focus:uppercase focus:text-[#14191a]"
        >
          Skip to content
        </a>
        <Grain />
        <MarketRibbon />
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        <SiteChat />
      </body>
    </html>
  );
}
