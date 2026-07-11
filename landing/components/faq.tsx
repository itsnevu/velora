"use client";

import { useState } from "react";
import { FAQ } from "@/lib/data";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="sec" id="faq">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// FAQ</span>
            <h2>Straight answers.</h2>
          </div>
          <p>The important ones, up front — scope, safety, and what this is not.</p>
        </div>
        <div className="faq">
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div className={"faq-item" + (isOpen ? " open" : "")} key={f.q}>
                <button className="faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                  <span>{f.q}</span>
                  <span className="pm">{isOpen ? "–" : "+"}</span>
                </button>
                <div className="faq-a">
                  <div className="inner">{f.a}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
