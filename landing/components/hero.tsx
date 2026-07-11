"use client";

import { useEffect, useRef } from "react";
import { PixelBot, PixelHill } from "@/components/ui/pixel-art";
import { HeroBackdrop } from "@/components/hero-backdrop";
import { RED, WHITE } from "@/lib/brand";

/** Hero with cursor-tracking red eyes (ROBIN DROIDS style) + subtle scene parallax. */
export function Hero() {
  const eyesRef = useRef<SVGSVGElement>(null);
  const pupilL = useRef<SVGRectElement>(null);
  const pupilR = useRef<SVGRectElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let tx = 0, ty = 0, sx = 0, sy = 0;

    function onMove(e: MouseEvent) {
      const svg = eyesRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const a = Math.atan2(e.clientY - cy, e.clientX - cx);
      tx = Math.cos(a) * 5;
      ty = Math.sin(a) * 4;
      // scene parallax: tiny counter-drift from viewport center
      sx = (e.clientX / window.innerWidth - 0.5) * -14;
      sy = (e.clientY / window.innerHeight - 0.5) * -8;
      if (!raf) raf = requestAnimationFrame(apply);
    }
    function apply() {
      raf = 0;
      const t = `translate(${tx.toFixed(1)},${ty.toFixed(1)})`;
      pupilL.current?.setAttribute("transform", t);
      pupilR.current?.setAttribute("transform", t);
      if (sceneRef.current) sceneRef.current.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    }
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="hero" id="top">
      <HeroBackdrop />
      <span className="hud tl" aria-hidden="true" />
      <span className="hud tr" aria-hidden="true" />
      <span className="hud bl" aria-hidden="true" />
      <span className="hud br" aria-hidden="true" />
      <span className="coords">VLR-011 // 07.26</span>
      <span className="coords right">DESK-04 // ONLINE</span>

      <div className="scene" ref={sceneRef} aria-hidden="true">
        <PixelHill />
        <PixelBot className="bot" />
      </div>

      <svg className="eyes" ref={eyesRef} viewBox="0 0 120 52" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="4" y="8" width="40" height="36" fill={RED} />
        <rect x="12" y="0" width="32" height="8" fill={RED} />
        <rect ref={pupilL} x="20" y="16" width="12" height="20" fill={WHITE} />
        <rect x="76" y="8" width="40" height="36" fill={RED} />
        <rect x="76" y="0" width="32" height="8" fill={RED} />
        <rect ref={pupilR} x="88" y="16" width="12" height="20" fill={WHITE} />
      </svg>

      <div className="wrap hero-inner">
        <span className="tag">
          <span className="dot" /> VLR // DESK_01
        </span>
        <h1 className="title">
          VELORA<span className="dot">.</span>
        </h1>
        <div className="subtitle">Agentic AI Trading Research Desk</div>
        <div className="lede">
          THE DESK NEVER SLEEPS //
          <br />
          THE TRIGGER IS ALWAYS YOURS.
        </div>
        <div className="hero-cta">
          <a href="#access" className="btn btn-primary">
            Request Access ▸
          </a>
          <a href="#flow" className="btn btn-ghost">
            See The Desk
          </a>
        </div>
        <div className="status">
          <span className="live" /> DESK STATUS / RESEARCH-ONLY · HUMAN-IN-THE-LOOP
        </div>
      </div>
    </section>
  );
}
