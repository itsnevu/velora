/**
 * The Velora brand mark — the pixel-dissolve "V" tile (public/velora-logo.png).
 * Rendered as a bordered square so the lime-on-lime logo reads as a crisp icon
 * on the lime header/footer. Replaces the old inline BrandMark SVG site-wide.
 */
export function VeloraLogo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/velora-logo.png"
      alt="Velora logo"
      width={size}
      height={size}
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        border: "2px solid var(--ink)",
        flex: "none",
      }}
    />
  );
}
