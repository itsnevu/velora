"use client";

import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

/**
 * Blur-in reveal primitives for the cinematic route. When the element scrolls
 * into view we add `.in`; the CSS in experience.css does the blur→sharp,
 * translate-up, fade. Children stagger via a `--i` custom property.
 * Progressive enhancement: no IntersectionObserver → reveal immediately.
 */
function useReveal<T extends HTMLElement>(once = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("in");
            if (once) io.disconnect();
          } else if (!once) {
            el.classList.remove("in");
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return ref;
}

/** Single block that blurs in when it enters view. */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
  i = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "span" | "p" | "h1" | "h2" | "h3";
  i?: number;
  style?: CSSProperties;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`vx-reveal ${className}`}
      style={{ "--i": i, ...style }}
    >
      {children}
    </Tag>
  );
}

/** Multi-line paragraph; each line masks + blurs in, staggered. */
export function RevealLines({
  lines,
  className = "",
  as: Tag = "p",
  step = 90,
}: {
  lines: string[];
  className?: string;
  as?: "p" | "div" | "h2" | "h3";
  step?: number;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag ref={ref as React.Ref<never>} className={`vx-r-group ${className}`} style={{ "--step": `${step}ms` }}>
      {lines.map((line, i) => (
        <span className="vx-line" key={i}>
          <span className="vx-reveal" style={{ "--i": i }}>
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}

/** Headline split into characters that blur in one after another. */
export function RevealChars({
  text,
  className = "",
  as: Tag = "h2",
  step = 34,
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "span";
  step?: number;
}) {
  const ref = useReveal<HTMLElement>();
  const chars = [...text];
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`vx-r-group vx-chars ${className}`}
      style={{ "--step": `${step}ms` }}
      aria-label={text}
    >
      {chars.map((ch, i) => (
        <span className="vx-reveal" style={{ "--i": i }} key={i} aria-hidden="true">
          {ch === " " ? " " : ch}
        </span>
      ))}
    </Tag>
  );
}
