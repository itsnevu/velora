import type { Metadata, Viewport } from "next";
import { Archivo_Black, Press_Start_2P, Space_Mono, Cormorant_Garamond, Instrument_Sans } from "next/font/google";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import "./globals.css";

const display = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press", display: "swap" });
const mono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-space", display: "swap" });
// cinematic homepage type: thin high-contrast serif + clean sans
const serif = Cormorant_Garamond({
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Instrument_Sans({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-sans", display: "swap" });

const TITLE = "VELORA // Agentic Trading Desk";
const DESC =
  "A desk of AI analysts that research your watchlist 24/7 and never place an order without your approval. Human-in-the-loop. Equities. Beta.";

// Favicons come from the file-based metadata convention: app/icon.png + app/apple-icon.png
// (the Velora "V" mark). Next injects the <link rel="icon"> tags automatically.
const OG_IMAGE = "/velora-logo.png";

export const metadata: Metadata = {
  title: { default: TITLE, template: "%s // VELORA" },
  description: DESC,
  keywords: ["Velora", "agentic AI", "trading desk", "Robinhood Agentic", "multi-agent", "human-in-the-loop"],
  openGraph: { title: TITLE, description: DESC, type: "website", siteName: "VELORA", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [OG_IMAGE] },
};

export const viewport: Viewport = {
  themeColor: "#c5e94a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${display.variable} ${pixel.variable} ${mono.variable} ${serif.variable} ${sans.variable}`}>
      <body>
        <noscript>
          {/* Progressive enhancement: without JS, reveal content and hide the JS-driven boot overlay. */}
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}.boot{display:none!important}`}</style>
        </noscript>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
