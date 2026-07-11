"use client";

import { useState } from "react";
import { RISK } from "@/lib/data";

/** Interactive position-sizing demo — cross the per-trade cap and the Risk Manager vetoes. */
export function RiskLab() {
  const [equity, setEquity] = useState(10000);
  const [weight, setWeight] = useState(4);

  const pos = Math.round((equity * weight) / 100);
  const over = weight > RISK.capPct;
  const fillPct = Math.min(100, (weight / RISK.maxWeight) * 100);
  const capLeft = (RISK.capPct / RISK.maxWeight) * 100;

  return (
    <section className="sec" id="risklab">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// RISK LAB · INTERACTIVE</span>
            <h2>
              Size a trade.<br />Watch the veto.
            </h2>
          </div>
          <p>
            The Risk Manager checks every proposal against a written per-trade cap of {RISK.capPct}%. Move the
            sliders — cross the cap and it vetoes.
          </p>
        </div>
        <div className="risklab">
          <div>
            <div className="ctrl">
              <label htmlFor="rl-eq">
                Account equity <b>${equity.toLocaleString()}</b>
              </label>
              <input
                id="rl-eq"
                type="range"
                min={RISK.minEquity}
                max={RISK.maxEquity}
                step={500}
                value={equity}
                onChange={(e) => setEquity(+e.target.value)}
              />
            </div>
            <div className="ctrl">
              <label htmlFor="rl-wt">
                Position weight <b>{weight}%</b>
              </label>
              <input
                id="rl-wt"
                type="range"
                min={1}
                max={RISK.maxWeight}
                step={1}
                value={weight}
                onChange={(e) => setWeight(+e.target.value)}
              />
            </div>
            <div className="risk-meter">
              <div className={"fill" + (over ? " over" : "")} style={{ width: fillPct + "%" }} />
              <div className="cap" style={{ left: capLeft + "%" }} />
            </div>
            <p style={{ fontFamily: "var(--ff-pixel)", fontSize: 8, letterSpacing: 1, marginTop: 12, color: "var(--ink-soft)" }}>
              ▲ RED MARK = {RISK.capPct}% PER-TRADE CAP
            </p>
          </div>
          <div className="risk-out">
            <div className="lbl">Proposed position</div>
            <div className="big">${pos.toLocaleString()}</div>
            <div className={"risk-verdict " + (over ? "veto" : "ok")}>
              {over ? "⛔ VETO — EXCEEDS CAP" : "✓ APPROVE — WITHIN CAP"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
