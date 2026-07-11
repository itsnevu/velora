import { BrandMark } from "@/components/ui/pixel-art";

const FOOT_LINKS = [
  { label: "THE DESK", href: "#desk" },
  { label: "HOW IT WORKS", href: "#flow" },
  { label: "THE TEAM", href: "#team" },
  { label: "GUARDRAILS", href: "#safety" },
  { label: "ROADMAP", href: "#roadmap" },
];

export function CtaFooter() {
  return (
    <>
      <section className="sec dark cta-band" id="access" style={{ borderBottom: "3px solid var(--ink)" }}>
        <div className="wrap">
          <span className="eyebrow">// 04 — ACCESS</span>
          <h2>Open the desk.</h2>
          <p>
            Talk to the desk in plain language. It researches your watchlist and hands you a preview —
            you decide whether it ever becomes an order.
          </p>
          <a href="#top" className="btn btn-lime">
            Request Access ▸
          </a>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <a href="#top" className="brand">
              <BrandMark />
              VELORA
            </a>
            <div className="foot-links">
              {FOOT_LINKS.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </div>
          </div>
          <div className="foot-status">
            <span className="fs">
              <span className="d" /> DESK · RESEARCH-ONLY
            </span>
            <span className="fs">
              <span className="d" /> GUARDRAILS · ARMED
            </span>
            <span className="fs">
              <span className="d" style={{ background: "var(--warn)" }} /> MODE · BETA
            </span>
            <span className="fs">
              <span className="d" style={{ background: "var(--red)" }} /> ORDERS · HUMAN-APPROVED
            </span>
          </div>
          <div className="disclaimer">
            <strong>⚠ DISCLAIMER</strong>
            Velora is a research &amp; recommendation tool, <b>not financial advice</b>. Robinhood Agentic
            Trading is in beta (US, equities only). The desk trades only inside an isolated Agentic account
            funded with a dedicated budget — that budget is the most it can ever lose. There is no track
            record and no performance claim here. All investment decisions are your own responsibility. Use
            only risk capital.
          </div>
          <div className="copy">© 2026 VELORA // BUILT ON CLAUDE CODE · ROBINHOOD AGENTIC · REFERENCE ARCHITECTURE</div>
        </div>
      </footer>
    </>
  );
}
