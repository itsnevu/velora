import { Reveal } from "@/components/ui/reveal";

export function Token() {
  return (
    <section className="sec dark" id="token">
      <div className="wrap">
        <span className="eyebrow">// WEB3 · EXPERIMENTAL</span>
        <Reveal className="token-box">
          <div>
            <h3>$VLRA — a roadmap experiment</h3>
            <p>
              A planned utility token on Robinhood Chain (L2) for premium research access, governance
              over risk parameters, and fee discounts — deployed testnet-first via a launchpad.
            </p>
            <p>
              It is a Web3 experiment, not a fundraising or investment vehicle. Chain details, launchpad
              terms, and legal status are unverified open items pending review.
            </p>
          </div>
          <div className="warn-note">
            ⚠ NOT A SECURITY OFFERING.
            <br />
            NOT INVESTMENT ADVICE.
            <br />
            TESTNET-FIRST · SUBJECT TO REVIEW.
          </div>
        </Reveal>
      </div>
    </section>
  );
}
