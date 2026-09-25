/**
 * Felt & Vellum — Bardcast's brand direction (see docs/brand.md).
 *
 * The app is the game table: a dark felt ground where the party sits. Anything
 * you'd hold in your hands at the table (a character sheet, an episode, a
 * prompt card) is vellum laid on top. Every player gets a voice colour and a
 * wax seal pressed from their own recording.
 *
 * These constants mirror tokens.css; keep the two in sync the same way the Zod
 * schemas mirror the lexicons. TS constants exist because the app shells use
 * inline styles; tokens.css exists for stylesheet-based UI.
 */

export * from "./marks.js";

export const color = {
  /** The room behind the table — browser canvas outside the app column. */
  room: "#0B110E",
  /** Page ground. The felt itself. */
  felt: "#111A16",
  /** Cards and raised surfaces on felt. */
  feltRaised: "#18231E",
  /** Dividers, tracks, alternative buttons. */
  feltLine: "#26352E",
  /** The unwalked trail, a chapter being gathered. */
  feltWorn: "#4A5C53",
  /** Text on felt. Also the DM's colour and chalk handwriting. */
  chalk: "#ECE7DB",
  /** Secondary text on felt — a real colour, not an opacity. */
  chalkDim: "#A2AA9E",

  /** Sheets and episodes — paper laid on the felt. */
  vellum: "#EFE8D8",
  /** A card resting on vellum (quotes). */
  vellumRaised: "#F4EEE1",
  /** Rules and tracks on vellum. */
  vellumLine: "#D9D0BC",
  /** Text on vellum. */
  ink: "#1E1A15",
  /** Secondary text on vellum. */
  inkDim: "#605849",
  /** The DM's pencil on vellum. */
  pencil: "#5A554C",
  /** A trait still being learned (below the confidence line). */
  learning: "#A89E8A",

  /** The one next action on a screen. Nothing else uses it. */
  candle: "#EBAA4C",
  /** Recording, danger, a failed roll. */
  hearth: "#C4543F",
  /** Hearth as text on felt (warnings, "needs voice", revoke). */
  hearthSoft: "#E4826E",
  /** Ready, a natural 20. */
  moss: "#8DBE7A",

  /** Stains — one per screen at most, never under text. */
  ale: "#C9A56A",
  tea: "#7A5A32",
  blood: "#9E3A2A",
} as const;

export const font = {
  /** Chapter titles, character names, prompts, drives, quotes — anything spoken in the story. 22–44px. */
  display: '"Young Serif", "Iowan Old Style", Georgia, serif',
  /** Buttons, body copy, labels. 17px body on mobile, never below 13. */
  ui: 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif',
  /** Dice, durations, readiness, handles, eyebrows. Lowercase. 11–13px. */
  mono: '"DM Mono", "SF Mono", Menlo, Consolas, monospace',
  /** The DM's hand. Only the DM writes by hand, never more than a line. */
  hand: 'Kalam, "Bradley Hand", cursive',
} as const;

/** Pure-CSS surface textures. Spread into an inline style. */
export const texture = {
  /** Felt: a two-layer dot weave at 9px. */
  felt: {
    backgroundColor: color.felt,
    backgroundImage:
      "radial-gradient(rgba(236,231,219,0.06) 1px, transparent 1.3px), radial-gradient(rgba(0,0,0,0.3) 1px, transparent 1.3px)",
    backgroundSize: "9px 9px, 9px 9px",
    backgroundPosition: "0 0, 4.5px 4.5px",
  },
  /** Vellum: a fine 5px grain, with ink as its text colour. */
  vellum: {
    backgroundColor: color.vellum,
    backgroundImage: "radial-gradient(rgba(96,88,73,0.12) 0.8px, transparent 1px)",
    backgroundSize: "5px 5px",
    color: color.ink,
  },
  /** The room around the table, a looser 14px weave. */
  room: {
    backgroundColor: color.room,
    backgroundImage: "radial-gradient(rgba(236,231,219,0.05) 1px, transparent 1.3px)",
    backgroundSize: "14px 14px",
  },
} as const;

/**
 * Shapes come from the dice. Surfaces stay near-square (6px cards, 3–4px
 * chips); buttons are the side of a d6 (bevelled ends); play keys, record keys,
 * chapter stops and thrown dice are hexagons.
 */
export const shape = {
  /** Bevelled button ends. `inset` is 16 for 56px buttons, 13 for 44px. */
  bevel: (inset: number) =>
    `polygon(${inset}px 0, calc(100% - ${inset}px) 0, 100% 50%, calc(100% - ${inset}px) 100%, ${inset}px 100%, 0 50%)`,
  /** A flat-sided hexagon for square keys and dice. */
  hex: "polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)",
  radius: { card: 6, well: 4, chip: 3 },
} as const;

/**
 * Voice colours. Every player's hue shares one lightness and chroma so no voice
 * is louder than another; only the hue changes. On vellum, drop to the ink
 * pair. A party can have up to eight.
 */
export const voiceHues = [35, 80, 130, 180, 220, 250, 290, 320] as const;

export function voiceColor(hue: number, ground: "felt" | "vellum" = "felt"): string {
  return ground === "felt" ? `oklch(0.76 0.11 ${hue})` : `oklch(0.52 0.12 ${hue})`;
}

/** Canonical voice lines — the tone reference for any copy an adapter emits. */
export const voice = {
  tagline: "Your table, told back in your own voices.",
  cta: "Pull up a chair",
  promptNotification: (characterName: string) => `The DM has a question for ${characterName}.`,
  answerAs: (characterName: string) => `Answer as ${characterName}`,
  chapterRelease: (chapterTitle: string, minutes: number, voices: number) =>
    `${chapterTitle} is told — ${minutes} minutes, all ${voices} of you.`,
} as const;
