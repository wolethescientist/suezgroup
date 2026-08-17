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
    default: "Suez Group - An Abuja energy group",
    template: "%s - Suez Group",
  },
  description:
    "Suez Group connects Software, ICT, Gas, Trading and Electric services through one operating network from Abuja, Nigeria.",
  openGraph: {
    title: "Suez Group - An Abuja energy group",
    description:
    "Software, ICT, LPG distribution, prepaid electricity vending, import and haulage, from Abuja.",
    type: "website",
    locale: "en_NG",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "Suez Group energy infrastructure" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Suez Group - An Abuja energy group",
    description: "Software, ICT, cooking gas, electricity, import and haulage from Abuja.",
    images: ["/og-image.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f2ec",
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
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-ember focus:px-4 focus:py-2 focus:text-xs focus:uppercase focus:text-slate"
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
