import {
  color,
  episodeWaveform,
  font,
  ringStain,
  seal as pressSeal,
  SEAL_GLINT,
  SEAL_PRESS_R,
  shape,
  splatter,
  texture,
  waveform,
  type Seal,
  type SpeakerSegment,
} from "@bardcast/brand";
import { useMemo, type CSSProperties, type ReactNode } from "react";

/**
 * Shared brand furniture for the web front door — Felt & Vellum. Every app in
 * the repo styles inline off @bardcast/brand (see docs/brand.md — the tokens are
 * the source of truth; never hard-code a hex). This module keeps the common
 * shells in one place so each screen stays about its content.
 *
 * The candle rule: `styles.candle` marks the single next action on a screen.
 * If a screen shows two candle elements, one is wrong. Semantic states
 * (moss / hearth) are not accents and don't count against it.
 *
 * Loose, not tidy: cards and seals may sit 1–2° off, but text stays straight.
 */

const button: CSSProperties = {
  border: "none",
  fontFamily: font.ui,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};
const big: CSSProperties = { ...button, height: 56, padding: "0 32px", fontSize: 17, clipPath: shape.bevel(16) };
const small: CSSProperties = { ...button, height: 44, padding: "0 22px", fontSize: 15, clipPath: shape.bevel(13) };

export const styles = {
  main: {
    minHeight: "100dvh",
    ...texture.felt,
    color: color.chalk,
    fontFamily: font.ui,
    display: "flex",
    flexDirection: "column",
    // Stains and hero seals are positioned against the page column.
    position: "relative",
    overflowX: "hidden",
  } as CSSProperties,
  /** The mobile column: a 24px gutter, capped so it reads as a phone on desktop. */
  page: { width: "100%", maxWidth: 520, margin: "0 auto", padding: "24px 24px 48px", boxSizing: "border-box", position: "relative" } as CSSProperties,

  eyebrow: { fontFamily: font.mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: color.chalkDim, margin: 0 } as CSSProperties,
  h1: { fontFamily: font.display, fontWeight: 400, fontSize: 36, lineHeight: 1.08, margin: "8px 0", textWrap: "pretty" } as CSSProperties,
  h2: { fontFamily: font.display, fontWeight: 400, fontSize: 22, lineHeight: 1.2, margin: "0 0 8px" } as CSSProperties,
  lede: { fontSize: 17, lineHeight: 1.5, color: color.chalkDim, margin: 0, textWrap: "pretty" } as CSSProperties,
  muted: { fontSize: 15, lineHeight: 1.45, color: color.chalkDim } as CSSProperties,
  meta: { fontFamily: font.mono, fontSize: 12, color: color.chalkDim } as CSSProperties,

  card: { background: color.feltRaised, borderRadius: shape.radius.card, padding: 20 } as CSSProperties,
  row: { display: "flex", gap: 12, flexWrap: "wrap" } as CSSProperties,

  // Buttons are the side of a d6. `candle` is the one next action per screen;
  // `secondary` is the felt alternative; `quiet` and `danger` are 44px.
  candle: { ...big, background: color.candle, color: color.felt, fontWeight: 600 } as CSSProperties,
  secondary: { ...big, background: color.feltLine, color: color.chalk, fontWeight: 500 } as CSSProperties,
  compact: { ...small, background: color.feltLine, color: color.chalk, fontWeight: 500 } as CSSProperties,
  quiet: { ...small, background: "transparent", color: color.chalkDim } as CSSProperties,
  danger: { ...small, background: "rgba(196,84,63,0.2)", color: color.hearthSoft } as CSSProperties,
  disabled: { background: color.feltLine, color: color.chalkDim, cursor: "not-allowed", fontWeight: 400 } as CSSProperties,
  /** A text-only back link in the header row. */
  back: { height: 44, padding: "0 10px", background: "transparent", border: "none", color: color.chalkDim, fontFamily: font.ui, fontSize: 15, cursor: "pointer" } as CSSProperties,

  input: {
    width: "100%",
    boxSizing: "border-box",
    height: 52,
    padding: "0 16px",
    fontSize: 17,
    fontFamily: font.ui,
    background: color.felt,
    color: color.chalk,
    border: `1px solid ${color.feltLine}`,
    borderRadius: shape.radius.well,
  } as CSSProperties,
  label: { display: "block", fontSize: 14, color: color.chalkDim, margin: "0 0 6px" } as CSSProperties,
  chip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 12px", borderRadius: shape.radius.chip, background: color.feltRaised } as CSSProperties,
  /** A sheet of vellum laid on the felt. */
  vellum: { ...texture.vellum, position: "relative", overflow: "hidden", borderRadius: shape.radius.card } as CSSProperties,
  vellumEyebrow: { fontFamily: font.mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: color.inkDim } as CSSProperties,
} as const;

/** Stroke weights that read the same at every seal size. */
function sealStroke(size: number): number {
  return 0.75 + 70 / size;
}

/**
 * A voice seal: wax in the player's voice colour (bone for the DM and the logo),
 * the imprint facing in. Pass a pre-pressed `seal` or a `seed` + options.
 */
export function SealMark({
  seal,
  size,
  rotate = 0,
  shadow = "0 2px 2px rgba(0,0,0,0.45)",
  style,
  label,
}: {
  seal: Seal;
  size: number;
  rotate?: number;
  shadow?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const sw = sealStroke(size);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ flex: "none", overflow: "visible", filter: `drop-shadow(${shadow})`, transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }}
    >
      <path d={seal.blob} fill={seal.wax} />
      <circle cx="50" cy="50" r={SEAL_PRESS_R} fill={seal.press} />
      <circle cx="50" cy="50" r={SEAL_PRESS_R} fill="none" stroke={seal.deep} strokeWidth={sw} />
      <path d={seal.spokes} stroke={seal.deep} strokeWidth={sw * 1.15} strokeLinecap="round" fill="none" />
      <path d={SEAL_GLINT} stroke="rgba(255,255,255,0.3)" strokeWidth={sw} strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The logo: a small bone seal, tilted slightly, beside the lowercase wordmark. */
export function Logo() {
  const logo = useMemo(() => pressSeal("bardcast", { bone: true, bars: 24 }), []);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, color: color.chalk }}>
      <SealMark seal={logo} size={30} rotate={-8} />
      <span style={{ fontFamily: font.display, fontSize: 21 }}>bardcast</span>
    </span>
  );
}

/** Standard header: logo on the left, optional actions on the right. */
export function TopBar({ actions, onHome }: { actions?: ReactNode; onHome?: () => void }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", width: "100%", maxWidth: 520, margin: "0 auto", boxSizing: "border-box" }}>
      {onHome ? (
        <button onClick={onHome} aria-label="Home" style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
          <Logo />
        </button>
      ) : (
        <Logo />
      )}
      {actions}
    </header>
  );
}

/** A plain bar waveform (a recording, a quote). */
export function Waveform({ seed, bars, step = 5, height, barWidth = 2.5, fill }: { seed: string; bars: number; step?: number; height: number; barWidth?: number; fill: string }) {
  const data = useMemo(() => waveform(seed, bars, step, height), [seed, bars, step, height]);
  const width = (bars - 1) * step + barWidth;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ flex: "none", maxWidth: "100%" }}>
      {data.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={barWidth} height={b.h} rx={barWidth / 2} fill={fill} />
      ))}
    </svg>
  );
}

/**
 * An episode waveform: each bar tinted by who is speaking at that moment, so you
 * can scrub to your own lines. Played portion is full colour; ahead is 35%.
 */
export function EpisodeWave({
  seed,
  bars,
  step = 5,
  height,
  barWidth = 2.5,
  segments,
  played,
  colorOf,
}: {
  seed: string;
  bars: number;
  step?: number;
  height: number;
  barWidth?: number;
  segments: readonly SpeakerSegment[];
  played: number;
  colorOf: (speaker: string) => string;
}) {
  const data = useMemo(() => episodeWaveform(seed, bars, step, height, segments, played), [seed, bars, step, height, segments, played]);
  const width = (bars - 1) * step + barWidth;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden style={{ flex: "1 1 auto", minWidth: 0, maxWidth: width }}>
      {data.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={barWidth} height={b.h} rx={barWidth / 2} fill={colorOf(b.speaker)} opacity={b.played ? 1 : 0.35} />
      ))}
    </svg>
  );
}

/** Play/record keys are hexagons — a die set down on the table. */
export function HexKey({
  size,
  background,
  children,
  onClick,
  label,
  style,
}: {
  size: number;
  background: string;
  children: ReactNode;
  onClick?: () => void;
  label: string;
  style?: CSSProperties;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{ ...button, flex: "none", width: size, height: size, padding: 0, background, clipPath: shape.hex, ...style }}
    >
      {children}
    </button>
  );
}

/** The play glyph, sized to its key. */
export function PlayGlyph({ size, fill }: { size: number; fill: string }) {
  const h = Math.round(size * 0.29);
  return <span style={{ width: 0, height: 0, borderLeft: `${Math.round(size * 0.27)}px solid ${fill}`, borderTop: `${h / 2}px solid transparent`, borderBottom: `${h / 2}px solid transparent`, marginLeft: Math.round(size * 0.08) }} />;
}

/**
 * A thrown die beside the story beat it decided. Hearth for a failure, chalk
 * for a success, moss for a natural 20. Candle stays reserved for the next action.
 */
export function Die({ value, tone, label, rotate }: { value: number; tone: "fail" | "success" | "crit"; label: string; rotate: number }) {
  const bg = tone === "fail" ? color.hearth : tone === "crit" ? color.moss : color.chalk;
  const fg = tone === "fail" ? color.chalk : color.felt;
  return (
    <span style={{ flex: "none", marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, transform: `rotate(${rotate}deg)` }} title={`${label} ${value}`}>
      <span style={{ width: 30, height: 30, background: bg, color: fg, clipPath: shape.hex, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, fontSize: 13, fontWeight: 500 }}>
        {value}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: color.chalkDim }}>{label}</span>
    </span>
  );
}

/** A chapter stop on the trail: a hexagon with a Roman numeral. */
export function Stop({ numeral, state }: { numeral: string; state: "told" | "gathering" | "sealed" }) {
  const tone =
    state === "told"
      ? { background: color.chalk, color: color.felt }
      : state === "gathering"
        ? { background: color.feltWorn, color: color.chalk }
        : { background: color.feltRaised, color: color.chalkDim };
  return (
    <div style={{ width: 40, height: 40, ...tone, clipPath: shape.hex, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, fontSize: 13, fontWeight: 500 }}>
      {numeral}
    </div>
  );
}

/** The DM's handwriting. Chalk on felt, pencil on vellum. Never more than a line. */
export function HandNote({ children, ground, rotate = -1.5, style }: { children: ReactNode; ground: "felt" | "vellum"; rotate?: number; style?: CSSProperties }) {
  return (
    <span style={{ fontFamily: font.hand, fontSize: 19, lineHeight: 1.3, color: ground === "felt" ? color.chalk : color.pencil, transform: `rotate(${rotate}deg)`, display: "inline-block", ...style }}>
      {children}
    </span>
  );
}

/** A small status dot (ready / learning / needs voice). */
export function Dot({ tone, size = 7 }: { tone: string; size?: number }) {
  return <span style={{ flex: "none", width: size, height: size, borderRadius: 999, background: tone }} />;
}

/**
 * A ring left by a mug (ale, on felt) or a cup (tea, on vellum). One stain per
 * screen at most, and never under text.
 */
export function RingStain({ seed, tone, style }: { seed: string; tone: "ale" | "tea"; style: CSSProperties }) {
  const strokes = useMemo(() => ringStain(seed, tone === "ale" ? 34 : 36), [seed, tone]);
  return (
    <svg viewBox="0 0 100 100" aria-hidden style={{ position: "absolute", pointerEvents: "none", mixBlendMode: tone === "tea" ? "multiply" : undefined, ...style }}>
      {strokes.map((s, i) => (
        <path key={i} d={s.d} stroke={tone === "ale" ? color.ale : color.tea} strokeWidth={s.width} opacity={s.opacity} fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Blood, where the story turns dangerous. */
export function SplatterStain({ seed, style }: { seed: string; style: CSSProperties }) {
  const s = useMemo(() => splatter(seed), [seed]);
  return (
    <svg viewBox="0 0 100 100" aria-hidden style={{ position: "absolute", pointerEvents: "none", opacity: 0.6, ...style }}>
      <path d={s.main} fill={color.blood} />
      {s.drops.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={color.blood} />
      ))}
    </svg>
  );
}
