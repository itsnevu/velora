"use client";

import { useEffect, useRef, useState } from "react";
import { STATS } from "@/lib/data";

function CountUp({ to, suffix }: { to: number; suffix: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (done.current || !entries.some((e) => e.isIntersecting)) return;
        done.current = true;
        io.disconnect();
        const dur = 900;
        let start = 0;
        const tick = (t: number) => {
          if (!start) start = t;
          const p = Math.min(1, (t - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(to * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return (
    <div className="v" ref={ref}>
      {n}
      {suffix}
    </div>
  );
}

export function StatsStrip() {
  return (
    <section className="sec" id="desk">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// 01 — THE DESK</span>
            <h2>
              Not a bot that<br />YOLOs your money.
            </h2>
          </div>
          <p>
            Velora is a small team of specialist AI analysts that screen your watchlist, debate every
            candidate, and hand you a one-click preview. You approve. It places. Never the other way around.
          </p>
        </div>
        <div className="stats">
          {STATS.map((s) => (
            <div className="stat" key={s.label}>
              <CountUp to={s.value} suffix={s.suffix} />
              <div className="l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
