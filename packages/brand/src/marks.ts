/**
 * Generative marks: wax seals, waveforms, stains, the hand-drawn trail and the
 * torn sheet edge. All are pure and deterministic from a string seed, so the
 * same player always presses the same seal and a page never reshuffles on
 * re-render. Output is SVG path data in a 100×100 box (seals, stains) or plain
 * numbers (waveforms) — rendering stays with each app.
 *
 * TODO(bardcast): seals and waveforms are seeded placeholders. Feed `envelope`
 * from the loudness envelope of the player's recordings once the voice
 * pipeline exposes it.
 */

/** FNV-1a string hash → 32-bit seed. */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny seeded PRNG in [0, 1). */
function rng(seedText: string): () => number {
  let seed = hash(seedText);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const f2 = (n: number) => n.toFixed(2);

/** Closed quadratic curve through points — the soft, uneven edge of wax or a splat. */
function smoothClosed(pts: Array<[number, number]>): string {
  const mid = (p: [number, number], q: [number, number]) => `${f2((p[0] + q[0]) / 2)} ${f2((p[1] + q[1]) / 2)}`;
  const n = pts.length;
  let d = `M${mid(pts[n - 1]!, pts[0]!)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    d += `Q${f2(p[0])} ${f2(p[1])} ${mid(p, pts[(i + 1) % n]!)}`;
  }
  return d + "Z";
}

function angleDist(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/** A synthetic loudness envelope: three layered sines with jitter, clamped to [0.1, 1]. */
function syntheticEnvelope(seed: string, n: number): number[] {
  const r = rng(seed);
  const f = [1 + Math.floor(r() * 3), 3 + Math.floor(r() * 4), 7 + Math.floor(r() * 6)];
  const ph = [r() * TAU, r() * TAU, r() * TAU];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const v = 0.5 + 0.25 * Math.sin(a * f[0]! + ph[0]!) + 0.15 * Math.sin(a * f[1]! + ph[1]!) + 0.1 * Math.sin(a * f[2]! + ph[2]!);
    out.push(Math.max(0.1, Math.min(1, v * (0.7 + r() * 0.6))));
  }
  return out;
}

/** Resample an envelope to `n` points (nearest). */
function resample(env: readonly number[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(0.1, Math.min(1, env[Math.floor((i / n) * env.length)] ?? 0.1)));
}

export interface Seal {
  /** The wax blob — an uneven disc with a couple of drips. */
  blob: string;
  /** The voice imprint: spokes from the rim of the press toward the centre. */
  spokes: string;
  wax: string;
  press: string;
  deep: string;
}

/** The radius of the pressed face within the 100×100 seal box. */
export const SEAL_PRESS_R = 35;
/** The glint arc along the upper-left rim. */
export const SEAL_GLINT = "M17 34 A38 38 0 0 1 33 15";

export interface SealOptions {
  /** Voice hue (see voiceHues). Ignored for bone. */
  hue?: number;
  /** Number of imprint spokes. ~72 for heroes, ~24–30 for avatars. */
  bars?: number;
  /** The DM and the logo press in bone wax. */
  bone?: boolean;
  /** How far spokes reach inward from the rim. */
  amp?: number;
  /** Real loudness envelope (0..1). When absent, a seeded placeholder is used. */
  envelope?: readonly number[];
}

/**
 * A voice seal: a disc of wax pressed with a player's own voice. The imprint
 * faces inward — spokes start at the rim and reach toward the centre, their
 * lengths taken from the loudness envelope.
 */
export function seal(seed: string, { hue = 35, bars = 72, bone = false, amp = 18, envelope }: SealOptions = {}): Seal {
  const r = rng(seed + "wax");
  const a0 = r() * TAU;
  const a1 = r() * TAU;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    let rad =
      43 +
      1.5 * Math.sin(a * 3 + a0) +
      1.1 * Math.sin(a * 7 + a1) +
      (r() - 0.5) * 1.4 +
      4 * Math.exp(-(angleDist(a, a0) ** 2) / 0.03) +
      2.5 * Math.exp(-(angleDist(a, a1) ** 2) / 0.02);
    rad = Math.min(49.5, rad);
    pts.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }

  const n = Math.max(12, Math.round(bars));
  const env = envelope ? resample(envelope, n) : syntheticEnvelope(seed, n);
  let spokes = "";
  env.forEach((v, i) => {
    const a = (i / n) * TAU - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r2 = SEAL_PRESS_R - 2 - amp * v;
    spokes += `M${f2(50 + c * (SEAL_PRESS_R - 2))} ${f2(50 + s * (SEAL_PRESS_R - 2))}L${f2(50 + c * r2)} ${f2(50 + s * r2)}`;
  });

  const tone = bone
    ? { wax: "#D9CFB8", press: "#CDC1A6", deep: "#6E6450" }
    : { wax: `oklch(0.52 0.13 ${hue})`, press: `oklch(0.46 0.12 ${hue})`, deep: `oklch(0.3 0.08 ${hue})` };
  return { blob: smoothClosed(pts), spokes, ...tone };
}

export interface WaveBar {
  x: number;
  y: number;
  h: number;
}

/** A bar waveform `n` bars long, `step` apart, centred in a box `height` tall. */
export function waveform(seed: string, n: number, step: number, height: number): WaveBar[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const v = 0.2 + 0.8 * Math.abs(Math.sin(i * 0.55 + r() * 1.5)) * (0.5 + r() * 0.5);
    const h = Math.max(3, v * height);
    return { x: i * step, y: (height - h) / 2, h };
  });
}

/** A speaker turn in an episode: who is talking and for how long (relative). */
export type SpeakerSegment = readonly [speaker: string, length: number];

export interface EpisodeBar extends WaveBar {
  speaker: string;
  played: boolean;
}

/**
 * An episode waveform where each bar knows who is speaking at that moment, so
 * the player can tint it in the speaker's voice colour and you can scrub to
 * your own lines. `played` is the fraction already heard.
 */
export function episodeWaveform(
  seed: string,
  n: number,
  step: number,
  height: number,
  segments: readonly SpeakerSegment[],
  played: number,
): EpisodeBar[] {
  const seq: string[] = [];
  segments.forEach(([who, len]) => {
    for (let i = 0; i < len; i++) seq.push(who);
  });
  return waveform(seed, n, step, height).map((b, i) => ({
    ...b,
    speaker: seq[Math.floor((i / n) * seq.length)] ?? "narrator",
    played: i / n < played,
  }));
}

export interface StainStroke {
  d: string;
  width: number;
  opacity: number;
}

/** A mug or cup ring: five broken, overlapping arcs around radius `r0` (100×100 box). */
export function ringStain(seed: string, r0 = 35): StainStroke[] {
  const r = rng(seed);
  return Array.from({ length: 5 }, (_, k) => {
    const a0 = r() * TAU;
    const sweep = 1.6 + r() * 3.8;
    const rad = r0 + (r() - 0.5) * 3;
    let d = "";
    for (let i = 0; i <= 48; i++) {
      const a = a0 + (sweep * i) / 48;
      const rr = rad + Math.sin(a * 5 + k) * 0.9;
      d += `${i ? "L" : "M"}${f2(50 + Math.cos(a) * rr)} ${f2(50 + Math.sin(a) * rr)}`;
    }
    return { d, width: 0.6 + r() * 2.2, opacity: 0.1 + r() * 0.16 };
  });
}

export interface Splatter {
  main: string;
  drops: Array<{ cx: number; cy: number; r: number }>;
}

/** A blood splatter: a spiky blob plus thrown drops (100×100 box). */
export function splatter(seed: string): Splatter {
  const r = rng(seed);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    const rad = 10 * (0.75 + r() * 0.4) + (r() < 0.28 ? 4 + r() * 12 : 0);
    pts.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }
  const drops = Array.from({ length: 14 }, () => {
    const a = r() * TAU;
    const dist = 20 + r() * 26;
    return { cx: 50 + Math.cos(a) * dist, cy: 50 + Math.sin(a) * dist, r: Math.max(0.5, 3.2 - dist / 16) * (0.6 + r() * 0.7) };
  });
  return { main: smoothClosed(pts), drops };
}

/**
 * The campaign trail: a wobbly vertical line in a 20×1000 box. `walked` is the
 * part already travelled (0..1).
 */
export function trail(seed: string, walked: number): { full: string; walked: string } {
  const r = rng(seed);
  let full = "";
  let done = "";
  for (let y = 0; y <= 1000; y += 25) {
    const x = 10 + Math.sin(y / 70) * 3 + (r() - 0.5) * 2.2;
    const seg = `${y ? "L" : "M"}${f2(x)} ${y}`;
    full += seg;
    if (y <= walked * 1000) done += seg;
  }
  return { full, walked: done };
}

/** A torn top edge as a CSS clip-path — for sheets torn off a pad. */
export function tornEdge(seed: string, teeth = 60, depth = 12): string {
  const r = rng(seed);
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    pts.push(`${f2((i / teeth) * 100)}% ${(1 + r() * depth * (r() < 0.1 ? 1.1 : 0.8)).toFixed(1)}px`);
  }
  return `polygon(${pts.join(", ")}, 100% 100%, 0 100%)`;
}
