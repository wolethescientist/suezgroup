import type { Metadata, Viewport } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-quicksand",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SuezCRM", template: "%s · SuezCRM" },
  description: "Independent customer relationship management for Suez Group.",
};

/**
 * Applies the saved theme before the first paint.
 *
 * This has to be an inline, blocking script in <head>. Anything that runs
 * after hydration — an effect, a provider — paints the light theme first and
 * then swaps, which is the white flash every dark mode is judged by. It reads
 * one key and sets one attribute; `dark` and `light` are explicit choices and
 * anything else falls through to the media query in globals.css.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("suez-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export const viewport: Viewport = { themeColor: "#f3862a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={quicksand.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
