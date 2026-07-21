/** The unified Aelix mark — geometric V + diamond (same family as the favicon
 *  and the app/vault headers): charcoal mark on a chartreuse rounded tile. */
export function AelixLogo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: "none",
        background: "#D7FE51",
        borderRadius: Math.max(6, Math.round(size * 0.28)),
        boxShadow: "0 0 18px rgba(215, 254, 81, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
      }}
    >
      <svg viewBox="0 0 32 32" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)}>
        <path d="M4 6 L16 27 L28 6 L22.6 6 L16 17.4 L9.4 6 Z" fill="#22242A" />
        <rect x="13.4" y="2.2" width="5.2" height="5.2" rx="0.4" transform="rotate(45 16 4.8)" fill="#22242A" />
      </svg>
    </span>
  );
}
