"use client";

import { useEffect, useState } from "react";

/** Pixel boot sequence that slides away after ~1.6s. Skippable; instant under reduced-motion. */
export function BootOverlay() {
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGone(true);
      return;
    }
    const t1 = setTimeout(() => setDone(true), 1650);
    const t2 = setTimeout(() => setGone(true), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  function skip() {
    setDone(true);
    setTimeout(() => setGone(true), 450);
  }

  if (gone) return null;

  return (
    <div className={"boot" + (done ? " done" : "")} aria-hidden="true">
      <div className="boot-logo">
        VELORA<span className="dot">.</span>
      </div>
      <div className="boot-bar">
        <div className="boot-fill" />
      </div>
      <div className="boot-label">
        BOOTING DESK<span className="bk">_</span> AGENTS · GUARDRAILS · MCP
      </div>
      <button className="boot-skip" onClick={skip}>
        [ CLICK TO SKIP ]
      </button>
    </div>
  );
}
