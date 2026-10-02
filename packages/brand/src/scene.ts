/**
 * The home page's night at the table: the sky over a day at the table, the
 * hearth fire, and the voice strands that rise out of it (see docs/brand.md,
 * "Home"). These are illustration colours, not UI tokens — nothing else on a
 * screen should reach for them.
 */

/** The sky by hour (0–24): night, dawn, a vellum-pale day, dusk, night again. */
export const skyStops: ReadonlyArray<readonly [hour: number, hex: string]> = [
  [0, "#0A100D"],
  [4.5, "#0E1714"],
  [5.5, "#2A2B33"],
  [6.5, "#7C513B"],
  [7.5, "#C9AE8A"],
  [9, "#E3D8C0"],
  [13, "#ECE5D4"],
  [16.5, "#E3D2B2"],
  [18, "#B9804F"],
  [19, "#5C3828"],
  [20, "#16201B"],
  [21, "#0E1512"],
  [24, "#0A100D"],
];

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** The sky colour at an hour of the day, as an [r, g, b] triple. */
export function skyAt(hour: number): [number, number, number] {
  const hh = ((hour % 24) + 24) % 24;
  for (let i = 0; i < skyStops.length - 1; i++) {
    const [h0, c0] = skyStops[i]!;
    const [h1, c1] = skyStops[i + 1]!;
    if (hh >= h0 && hh <= h1) {
      const t = (hh - h0) / (h1 - h0);
      const a = rgbOf(c0);
      const b = rgbOf(c1);
      return a.map((v, j) => Math.round(v + (b[j]! - v) * t)) as [number, number, number];
    }
  }
  return rgbOf(skyStops[0]![1]);
}

/** WCAG relative luminance of an [r, g, b] triple — decides chalk or ink over the sky. */
export function luminance([r, g, b]: readonly [number, number, number]): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export const scene = {
  /** The hill the fire sits on. */
  hill: "#070B09",
  sun: "#F6E3B4",
  sunGlow: "rgba(246,227,180,0.45)",
  moon: "#E6DFCC",
  /** Flame layers, outermost first. */
  flame: ["oklch(0.5 0.16 32)", "oklch(0.66 0.17 48)", "oklch(0.86 0.11 85)"],
  glow: "oklch(0.55 0.15 45 / 0.32)",
  ember: "#F2D9A0",
  logs: ["#3B2A1D", "#4A3424"],
  /** The empty seat waiting for your seal: a dashed ring of bone wax. */
  seat: "rgba(217,207,184,0.7)",
  seatLabel: "rgba(11,16,13,0.7)",
  /** The DM's strand is bone; each player's is their voice hue, a little brighter than on felt. */
  strandBone: "#CFC4AA",
  strand: (hue: number, alpha?: number) => `oklch(0.68 0.13 ${hue}${alpha === undefined ? "" : ` / ${alpha}`})`,
} as const;
