import { Reveal } from "@/components/ui/reveal";
import { CheckPixel, CrossPixel } from "@/components/ui/pixel-art";
import { COMPARE } from "@/lib/data";

export function WhyDifferent() {
  return (
    <section className="sec" id="why">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// WHY DIFFERENT</span>
            <h2>
              Two ways to let<br />an AI near your money.
            </h2>
          </div>
          <p>One hands the keys to a black box. The other keeps you in the chair and makes the machine prove its case first.</p>
        </div>
        <Reveal className="compare">
          <div className="col bad">
            <div className="ch">
              <CrossPixel /> {COMPARE.bad.head}
            </div>
            {COMPARE.bad.rows.map((r) => (
              <div className="crow" key={r}>
                <CrossPixel />
                {r}
              </div>
            ))}
          </div>
          <div className="col good">
            <div className="ch">
              <CheckPixel /> {COMPARE.good.head}
            </div>
            {COMPARE.good.rows.map((r) => (
              <div className="crow" key={r}>
                <CheckPixel />
                {r}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
