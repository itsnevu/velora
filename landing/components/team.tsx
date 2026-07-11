import { Reveal } from "@/components/ui/reveal";
import { TeamIcon } from "@/components/ui/pixel-art";
import { TEAM } from "@/lib/data";

export function Team() {
  return (
    <section className="sec" id="team">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// 03 — THE TEAM</span>
            <h2>
              A team, not<br />one prompt.
            </h2>
          </div>
          <p>
            Least privilege: only the PM has order tools. The analysts physically cannot place a
            trade — there are no order tools in their toolset.
          </p>
        </div>
        <div className="team">
          {TEAM.map((m, i) => (
            <Reveal key={m.key} delay={i * 60} className="card">
              <TeamIcon kind={m.key} />
              <h3>{m.name}</h3>
              <div className="role">{m.role}</div>
              <p>{m.body}</p>
              <div className="noorder">{m.note}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
