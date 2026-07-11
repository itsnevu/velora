import type { Metadata, Viewport } from "next";
import { Archivo_Black, Press_Start_2P, Space_Mono } from "next/font/google";
import "./globals.css";

const display = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press", display: "swap" });
const mono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-space", display: "swap" });

const TITLE = "VELORA // Agentic Trading Desk";
const DESC =
  "A desk of AI analysts that research your watchlist 24/7 and never place an order without your approval. Human-in-the-loop. Equities. Beta.";

// Emoji favicon as an inline SVG data URI — keeps the app self-contained (no asset file needed).
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23c5e94a'/%3E%3Crect x='6' y='18' width='4' height='8' fill='%2316180d'/%3E%3Crect x='13' y='12' width='4' height='14' fill='%2316180d'/%3E%3Crect x='20' y='8' width='4' height='18' fill='%23e23b3b'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: { default: TITLE, template: "%s // VELORA" },
  description: DESC,
  keywords: ["Velora", "agentic AI", "trading desk", "Robinhood Agentic", "multi-agent", "human-in-the-loop"],
  icons: { icon: FAVICON },
  openGraph: { title: TITLE, description: DESC, type: "website", siteName: "VELORA" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

export const viewport: Viewport = {
  themeColor: "#c5e94a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${display.variable} ${pixel.variable} ${mono.variable}`}>
      <body>
        <noscript>
          {/* Progressive enhancement: without JS, reveal content and hide the JS-driven boot overlay. */}
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}.boot{display:none!important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
