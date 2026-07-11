import { Reveal } from "@/components/ui/reveal";
import { ROADMAP } from "@/lib/data";

export function Roadmap() {
  return (
    <section className="sec" id="roadmap">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// ROADMAP</span>
            <h2>
              From guardrails<br />to go-live.
            </h2>
          </div>
          <p>Built in phases. Every trading feature ships behind human approval first, paper-trading second.</p>
        </div>
        <div className="road">
          {ROADMAP.map((p, i) => (
            <Reveal key={p.phase} delay={i * 40} className={"phase" + (("experimental" in p && p.experimental) ? " exp" : "")}>
              <div className="ph">{p.phase}</div>
              <h3>
                {p.title}
                {"experimental" in p && p.experimental && <span className="badge">EXPERIMENTAL · TESTNET</span>}
              </h3>
              <p>{p.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
