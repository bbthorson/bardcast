import { color, font } from "@bardcast/brand";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared brand furniture for the web front door. Every app in the repo styles
 * inline off @bardcast/brand (see docs/brand.md — the tokens are the source of
 * truth; never hard-code a hex). This module keeps the common shells in one
 * place so each screen stays about its content.
 *
 * The ember rule: `styles.ember` marks the single next action on a screen. If a
 * screen shows two ember elements, one is wrong. Semantic states
 * (moss / hearth red) are not accents and don't count against it.
 */

export const styles = {
  main: {
    minHeight: "100dvh",
    background: color.walnut,
    color: color.parchment,
    fontFamily: font.ui,
    display: "flex",
    flexDirection: "column",
  } as CSSProperties,
  page: { width: "100%", maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem", boxSizing: "border-box" } as CSSProperties,

  eyebrow: { color: color.parchmentDim, fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 } as CSSProperties,
  h1: { fontFamily: font.display, fontWeight: 600, fontSize: "2rem", lineHeight: 1.15, margin: "0.4rem 0" } as CSSProperties,
  h2: { fontFamily: font.display, fontWeight: 600, fontSize: "1.35rem", margin: "0 0 0.5rem" } as CSSProperties,
  lede: { fontFamily: font.body, fontSize: "1.15rem", lineHeight: 1.5, color: color.parchment, margin: "0.5rem 0 0" } as CSSProperties,
  muted: { color: color.parchmentDim, fontSize: "0.9rem", lineHeight: 1.5 } as CSSProperties,

  card: { background: color.walnutRaised, border: `1px solid ${color.walnut}`, borderRadius: 12, padding: "1.25rem" } as CSSProperties,
  row: { display: "flex", gap: "0.75rem", flexWrap: "wrap" } as CSSProperties,

  // Buttons. `ember` is the accent — one per screen. `secondary` is the candle-gold
  // outline for the alternative action; `ghost` is quiet; `danger` is hearth red.
  ember: {
    padding: "0.85rem 1.3rem",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: color.ember,
    color: color.walnut,
    cursor: "pointer",
  } as CSSProperties,
  secondary: {
    padding: "0.85rem 1.3rem",
    fontSize: "1rem",
    borderRadius: 999,
    border: `1px solid ${color.candleGold}`,
    background: "transparent",
    color: color.candleGold,
    cursor: "pointer",
  } as CSSProperties,
  ghost: {
    padding: "0.6rem 0.9rem",
    fontSize: "0.9rem",
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: color.parchmentDim,
    cursor: "pointer",
  } as CSSProperties,
  danger: {
    padding: "0.7rem 1.1rem",
    fontSize: "0.9rem",
    borderRadius: 999,
    border: `1px solid ${color.hearthRed}`,
    background: "transparent",
    color: color.hearthRed,
    cursor: "pointer",
  } as CSSProperties,
  disabled: { background: color.walnutRaised, color: color.parchmentDim, cursor: "not-allowed", fontWeight: 400 } as CSSProperties,

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.85rem 1rem",
    fontSize: "1rem",
    fontFamily: font.ui,
    background: color.walnut,
    color: color.parchment,
    border: `1px solid ${color.parchmentDim}`,
    borderRadius: 10,
  } as CSSProperties,
  label: { display: "block", fontSize: "0.85rem", color: color.parchmentDim, margin: "0 0 0.35rem" } as CSSProperties,
} as const;

/** The hearth-mark: a waveform where one bar has caught fire, above the table line. */
export function HearthMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Bardcast">
      <circle cx="48" cy="48" r="45" fill="none" stroke={color.candleGold} strokeWidth="2.5" />
      <g fill={color.ember}>
        <rect x="26" y="52" width="7" height="14" rx="3.5" />
        <rect x="38" y="46" width="7" height="20" rx="3.5" />
        <rect x="63" y="52" width="7" height="14" rx="3.5" />
      </g>
      <path
        d="M53.5 66 C46 60 47.5 51 53.5 44 C52 51 60 52 58.5 59 C57.6 63.3 55.8 65.2 53.5 66 Z"
        fill={color.candleGold}
      />
      <rect x="24" y="70" width="48" height="2.5" rx="1.25" fill={color.candleGold} opacity="0.8" />
    </svg>
  );
}

/** The wordmark: the name set lowercase in the display face (docs/brand.md). */
export function Wordmark({ size = "1.4rem" }: { size?: string }) {
  return (
    <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: size, letterSpacing: "0.01em" }}>
      bardcast
    </span>
  );
}

/** Standard header: mark + wordmark on the left, optional actions on the right. */
export function TopBar({ actions }: { actions?: ReactNode }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: `1px solid ${color.walnutRaised}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <HearthMark size={34} />
        <Wordmark />
      </div>
      {actions}
    </header>
  );
}
