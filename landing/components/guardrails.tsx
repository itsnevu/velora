import { Reveal } from "@/components/ui/reveal";
import { GUARDS } from "@/lib/data";

export function Guardrails() {
  return (
    <section className="sec dark" id="safety">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// SAFETY POSTURE</span>
            <h2>
              Guardrails are structural,<br />not vibes.
            </h2>
          </div>
          <p>Read this before funding. The isolated Agentic budget is the most the desk can ever touch.</p>
        </div>
        <div className="guards">
          {GUARDS.map((g, i) => (
            <Reveal key={g.title} delay={i * 50} className="guard">
              <h3>
                <span className="b" /> {g.title}
              </h3>
              <p>{g.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
