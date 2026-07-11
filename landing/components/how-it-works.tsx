import { Reveal } from "@/components/ui/reveal";
import { STEPS } from "@/lib/data";

export function HowItWorks() {
  return (
    <section className="sec dark" id="flow">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// 02 — HOW IT WORKS</span>
            <h2>
              Sense → research →<br />risk → you decide.
            </h2>
          </div>
          <p>
            Steps 1–6 are research and produce no order. The desk&rsquo;s standard output is the
            preview card at step&nbsp;7 — it stops there until you say go.
          </p>
        </div>
        <div className="flow">
          {STEPS.map((s, i) => (
            <Reveal key={s.num} delay={i * 50} className={"step" + (("you" in s && s.you) ? " you" : "")}>
              <div className="num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
