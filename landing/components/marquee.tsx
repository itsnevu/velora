import { Fragment } from "react";
import { MARQUEE } from "@/lib/data";
import { cn } from "@/lib/cn";

export function Marquee({
  items = MARQUEE as readonly string[],
  alt = false,
}: {
  items?: readonly string[];
  alt?: boolean;
}) {
  const copy = (dup: boolean) => (
    <div className="marquee-track" aria-hidden={dup || undefined}>
      {items.map((item, i) => (
        <Fragment key={item + i}>
          <span>{item}</span>
          <span className="sep">◆</span>
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className={cn("marquee", alt && "alt")} aria-hidden="true">
      {/* two identical copies → seamless -50% loop */}
      <div className="marquee-loop">
        {copy(false)}
        {copy(true)}
      </div>
    </div>
  );
}
