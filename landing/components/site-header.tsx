"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/ui/pixel-art";
import { NAV } from "@/lib/data";
import { cn } from "@/lib/cn";

export function SiteHeader() {
  const [active, setActive] = useState<string>(NAV[0].href.slice(1));
  const [drawer, setDrawer] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const progRef = useRef<HTMLDivElement>(null);

  // scroll progress bar + back-to-top visibility
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        const p = max > 0 ? (h.scrollTop / max) * 100 : 0;
        if (progRef.current) progRef.current.style.width = p + "%";
        setShowTop(h.scrollTop > 600);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // scrollspy — highlight the nav item for the section in the viewport band
  useEffect(() => {
    const secs = NAV.map((n) => document.getElementById(n.href.slice(1))).filter(
      (el): el is HTMLElement => !!el,
    );
    if (!secs.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <>
      <div className="scroll-prog" ref={progRef} />
      <header className="hdr">
        <div className="nav">
          <a href="#top" className="brand">
            <BrandMark />
            VELORA
          </a>
          <nav className="nav-links">
            {NAV.map((item, i) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(item.href.slice(1) === active && "active", i === NAV.length - 1 && "cta")}
              >
                <span className="n">{item.n}</span> {item.label}
              </a>
            ))}
          </nav>
          <button className="burger" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className={cn("drawer", drawer && "open")} role="dialog" aria-modal={drawer} aria-label="Menu">
        <button className="drawer-close" aria-label="Close menu" onClick={() => setDrawer(false)}>
          ✕
        </button>
        {NAV.map((item) => (
          <a key={item.href} href={item.href} onClick={() => setDrawer(false)}>
            <span className="n">{item.n}</span> {item.label}
          </a>
        ))}
      </div>

      <button
        className={cn("totop", showTop && "show")}
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        ▲
      </button>
    </>
  );
}
