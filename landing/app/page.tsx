"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getLenis } from "@/lib/lenis-store";
import { Reveal, RevealLines, RevealChars } from "@/components/vx/reveal-text";
import { VAULT_URL } from "@/lib/links";
import "./vx.css";

const Diorama = dynamic(() => import("@/components/vx/diorama"), { ssr: false });

/* Velora "V" mark */
function VMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 6 L16 27 L28 6 L22.6 6 L16 17.4 L9.4 6 Z" />
      <rect x="13.4" y="2.2" width="5.2" height="5.2" rx="0.4" transform="rotate(45 16 4.8)" />
    </svg>
  );
}

const ArrowUpRight = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M8 6h10v10h-2.2V9.8L6.6 18.8 5.2 17.4 14.2 8.2H8z" />
  </svg>
);

const SECTIONS = [
  { id: "vx-hero", label: "Top" },
  { id: "vx-desk", label: "One Desk" },
  { id: "vx-angles", label: "Every Angle" },
  { id: "vx-built", label: "Built For" },
  { id: "vx-signals", label: "Signals" },
  { id: "vx-decide", label: "You Decide" },
  { id: "vx-view", label: "In View" },
  { id: "vx-run", label: "Run" },
];

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const l = getLenis();
  if (l) l.scrollTo(el, { offset: 0, duration: 1.4 });
  // no Lenis == the user prefers reduced motion — jump, don't animate
  else el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/* small diamond glyph for the "built for" trio icons */
const Diamond = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2l10 10-10 10L2 12z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 7l5 5-5 5-5-5z" />
  </svg>
);

/* mono micro-index eyebrow — the explanatory spine that lets a first-time
   visitor follow the story act by act. Tick · number · section name. */
function IndexLabel({ n, children, i = 0 }: { n: string; children: string; i?: number }) {
  return (
    <Reveal className="vx-index" i={i}>
      <span className="vx-index__tick" aria-hidden="true" />
      <span className="vx-index__n">{n}</span>
      <span className="vx-index__label">{children}</span>
    </Reveal>
  );
}

/**
 * Scroll-linked choreography — the vvvhound trick. Every RAF we compute each
 * section's progress through its runway (0 pinned-in → 1 about to unpin) and
 * write transform/opacity directly, so the CONTENT scrubs with the scroll
 * exactly like the WebGL scene behind it. Enter-once blur reveals still run
 * on top for the first impression; this drives the continuous motion.
 */
function useScrollChoreography(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const secs = Array.from(document.querySelectorAll<HTMLElement>(".vx-sec"));
    const inners = secs.map((s) => s.querySelector<HTMLElement>(".vx-sec__inner"));
    let raf = 0;

    const tick = () => {
      const vh = window.innerHeight;
      for (let i = 0; i < secs.length; i++) {
        const inner = inners[i];
        if (!inner) continue;
        const r = secs[i].getBoundingClientRect();
        const total = r.height - vh;
        const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0.5;

        // content drifts up through its act; eases in/out at the seams
        const drift = (p - 0.5) * -72;
        const fadeIn = i === 0 ? 1 : Math.min(1, p / 0.14);
        const fadeOut = Math.min(1, (1 - p) / 0.14);
        const o = Math.max(0, Math.min(fadeIn, fadeOut));
        const scale = i === 0 ? 1 - p * 0.06 : 1; // hero gently recedes

        inner.style.transform = `translate3d(0, ${drift.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
        inner.style.opacity = o.toFixed(3);
        // gate the blur-in reveals: they play once the act is actually pinned
        // (the hero counts as live immediately — the preloader gates it)
        inner.classList.toggle("vx-live", i === 0 || p > 0.001);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const inner of inners) {
        if (inner) {
          inner.style.transform = "";
          inner.style.opacity = "";
          inner.classList.add("vx-live"); // never leave reveals locked shut
        }
      }
    };
  }, [enabled]);
}

/** Heavier, more cinematic smooth-scroll while this page is mounted. */
function useCinematicLenis() {
  useEffect(() => {
    const l = getLenis();
    if (!l) return;
    const prevLerp = l.options.lerp;
    l.options.lerp = 0.085;
    return () => {
      l.options.lerp = prevLerp;
    };
  }, []);
}

export default function HomePage() {
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useCinematicLenis();
  useScrollChoreography(ready);

  // preloader count 0→100
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 1500;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      setPct(Math.round(p * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setReady(true), 300);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // scroll progress + active section
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const frac = max > 0 ? window.scrollY / max : 0;
      if (barRef.current) barRef.current.style.width = `${frac * 100}%`;
      // condense the header + reveal its hairline once we leave the hero top
      if (headerRef.current) headerRef.current.classList.toggle("is-scrolled", window.scrollY > 24);
      const mid = window.scrollY + window.innerHeight * 0.5;
      let idx = 0;
      for (let i = 0; i < SECTIONS.length; i++) {
        const el = document.getElementById(SECTIONS[i].id);
        if (el && el.offsetTop <= mid) idx = i;
      }
      setActive(idx);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="vx-root">
      {/* preloader — V mark inside a green progress ring, serif % counter */}
      <div className={`vx-preload ${ready ? "is-done" : ""}`}>
        <div className="vx-preload__mark">
          <div className="vx-preload__ring" style={{ "--pct": pct }} aria-hidden="true" />
          <VMark />
        </div>
        <div className="vx-preload__pct">
          {pct}<span className="vx-preload__sign">%</span>
        </div>
      </div>

      {/* WebGL scene + veils */}
      <Diorama />
      <div className="vx-veil" aria-hidden="true" />
      <div className="vx-grain" aria-hidden="true" />

      {/* scroll progress */}
      <div className="vx-progress" ref={barRef} aria-hidden="true" />

      {/* header */}
      <header className="vx-header" ref={headerRef}>
        <a className="vx-logo" href="/" aria-label="Velora home">
          <VMark />
          <span>Velora</span>
        </a>
        <nav className="vx-nav">
          <a className="vx-nav-link vx-nav-hide" href="/desk"><span>Desk</span></a>
          <a className="vx-nav-link vx-nav-hide" href="/docs"><span>Docs</span></a>
          <a className="vx-nav-cta" href={VAULT_URL}>
            <span>Launch app</span>
            <ArrowUpRight />
          </a>
        </nav>
      </header>

      {/* section navigator */}
      <div className="vx-navdots" role="navigation" aria-label="Sections">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            className={i === active ? "is-active" : ""}
            aria-label={s.label}
            aria-current={i === active}
            onClick={() => scrollToId(s.id)}
          >
            <span className="vx-navdots__dot" aria-hidden="true" />
            <span className="vx-navdots__label" aria-hidden="true">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── HERO ── */}
      <section className="vx-sec vx-h-hero" id="vx-hero">
        <div className="vx-sec__inner">
          <div className="vx-hud" aria-hidden="true">
            <span className="vx-hud__tick vx-hud__tick--tl" />
            <span className="vx-hud__tick vx-hud__tick--tr" />
            <span className="vx-hud__tick vx-hud__tick--bl" />
            <span className="vx-hud__tick vx-hud__tick--br" />
          </div>
          <Reveal className="vx-eyebrow" i={0}>
            <span className="vx-eyebrow__tick" aria-hidden="true" />
            On-chain agentic desk · testnet
          </Reveal>
          <RevealChars text="VELORA" as="h1" className="vx-hero-title" step={70} />
          <Reveal className="vx-sub vx-sub--hero" i={4} style={{ marginTop: "0.4em" }}>
            An AI trading desk that researches around the clock — and never trades without your yes.
          </Reveal>
        </div>
        <div className="vx-cue" aria-hidden="true">
          <span>Scroll to enter</span>
          <span className="vx-cue__line" />
        </div>
      </section>

      {/* ── ONE DESK ── */}
      <section className="vx-sec vx-h-tall" id="vx-desk">
        <div className="vx-sec__inner">
          <IndexLabel n="01">One Desk</IndexLabel>
          <div className="vx-mark">
            <VMark />
          </div>
          <RevealChars text="One Desk" as="h2" className="vx-title" />
          <RevealLines
            className="vx-sub"
            lines={["Reads the tape.", "Weighs the risk.", "Waits for you."]}
          />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "A desk of AI analysts researching your watchlist around the clock —",
              "an on-chain agentic layer where the rules and the record are verifiable,",
              "and no order is ever placed without your explicit yes.",
            ]}
          />
        </div>
      </section>

      {/* ── EVERY ANGLE ── */}
      <section className="vx-sec vx-h-mid" id="vx-angles">
        <div className="vx-sec__inner">
          <IndexLabel n="02">Every Angle</IndexLabel>
          <RevealChars text="Nothing Slips" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "Fundamental, technical and macro analysts each argue their read of a name,",
              "then a Risk Manager weighs the case — holding veto power over them all.",
            ]}
          />
        </div>
      </section>

      {/* ── BUILT FOR ── */}
      <section className="vx-sec vx-h-tall" id="vx-built">
        <div className="vx-sec__inner">
          <IndexLabel n="03">Built For</IndexLabel>
          <RevealChars text="The Deliberate" as="h2" className="vx-title vx-title--sm" />
          <div className="vx-trio">
            <Reveal className="vx-trio__item" i={1}>
              <span className="vx-trio__icon"><Diamond /></span>
              <h3>Traders</h3>
              <p>See the setup before you commit — levels, momentum and risk, read for you.</p>
            </Reveal>
            <Reveal className="vx-trio__item" i={2}>
              <span className="vx-trio__icon"><Diamond /></span>
              <h3>Holders</h3>
              <p>Know what you own. Positions and buying power, watched every session.</p>
            </Reveal>
            <Reveal className="vx-trio__item" i={3}>
              <span className="vx-trio__icon"><Diamond /></span>
              <h3>Researchers</h3>
              <p>Ask anything about any ticker — fundamentals, catalysts and the macro backdrop.</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── SIGNALS (river chapter) ── */}
      <section className="vx-sec vx-h-mid" id="vx-signals">
        <div className="vx-sec__inner">
          <IndexLabel n="04">Signals</IndexLabel>
          <RevealChars text="Signals, Not Noise" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "Headlines, filings and price action — distilled into what actually",
              "moves your names. Every read is quoted, sourced and shown, never blind.",
            ]}
          />
        </div>
      </section>

      {/* ── YOU DECIDE ── */}
      <section className="vx-sec vx-h-mid" id="vx-decide">
        <div className="vx-sec__inner">
          <IndexLabel n="05">You Decide</IndexLabel>
          <RevealChars text="You Decide" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "The desk proposes; you dispose. Position caps, stop rules and no",
              "averaging into losers become guardrails-as-code — the same written",
              "limits compiled on-chain, so they are enforced, not just promised.",
            ]}
          />
        </div>
      </section>

      {/* ── EVERYTHING IN VIEW (lake chapter) ── */}
      <section className="vx-sec vx-h-view" id="vx-view">
        <div className="vx-sec__inner">
          <IndexLabel n="06">On View</IndexLabel>
          <RevealChars text="Everything On View" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "An ERC-4626 vault holds the book; every decision and outcome is",
              "attested on-chain for a track record you can verify, not take on trust.",
              "One calm picture — nothing hidden, nothing assumed. Testnet preview.",
            ]}
          />
        </div>
      </section>

      {/* ── RUN / CTA ── */}
      <section className="vx-sec vx-h-last" id="vx-run">
        <div className="vx-sec__inner">
          <IndexLabel n="07">Run</IndexLabel>
          <RevealChars text="One Desk. Every Angle." as="h2" className="vx-title" step={26} />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "The calm layer over your watchlist — one reviewed decision at a time,",
              "on Robinhood Chain. Testnet-first · preview · not yet live.",
            ]}
          />
          <Reveal className="vx-cta-row" i={2}>
            <a className="vx-btn vx-btn-lime" href={VAULT_URL}>
              <span>Launch the app</span>
              <ArrowUpRight />
            </a>
            <a className="vx-btn vx-btn-glass" href="/desk">
              <span>Tour the desk</span>
            </a>
          </Reveal>
        </div>
      </section>

      <footer className="vx-foot">
        <Reveal className="vx-kicker" i={0}>Approved by you. Executed with care.</Reveal>
        <RevealChars text="Run with Velora" as="h2" className="vx-title" step={22} />
        <Reveal className="vx-cta-row" i={2}>
          <a className="vx-btn vx-btn-lime" href={VAULT_URL}><span>Launch the app</span><ArrowUpRight /></a>
          <a className="vx-btn vx-btn-glass" href="/docs"><span>Docs</span></a>
        </Reveal>
        <p className="vx-foot__legal">
          <b>Not investment advice.</b> Velora is an agentic research tool for Robinhood
          Agentic (beta). The desk researches and proposes; every order requires explicit
          human approval in session. On-chain features — the Guardrails library, ERC-4626
          vault, on-chain attestations and agent executor — are testnet-first and not yet
          live: nothing is deployed, all on-chain values shown are illustrative previews,
          and this is not an investment product. There is no track record. Nothing here is
          a recommendation to buy or sell any security. Use only risk capital.
        </p>
      </footer>
    </div>
  );
}
