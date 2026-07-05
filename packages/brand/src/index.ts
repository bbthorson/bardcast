/**
 * The Tavern Table — Bardcast's locked brand direction (see docs/brand.md).
 *
 * These constants mirror tokens.css; keep the two in sync the same way the
 * Zod schemas mirror the lexicons. TS constants exist because the app shells
 * use inline styles; tokens.css exists for stylesheet-based UI later.
 */

export const color = {
  /** Primary dark ground — app backgrounds, the table itself. */
  walnut: "#241A12",
  /** A slightly lifted walnut for cards and raised surfaces. */
  walnutRaised: "#2E2218",
  /** Primary text on dark grounds. */
  parchment: "#F0E3C9",
  /** Muted text on dark grounds (60% intent, kept as a real color). */
  parchmentDim: "#B9A98C",
  /** The accent. Reserved for the single next action on any screen. */
  ember: "#E07B39",
  /** Secondary accent — highlights, drop-caps, progress, chapter ritual. */
  candleGold: "#D9A441",
  /** Danger / recording-live / not-ready. */
  hearthRed: "#9C3F2E",
  /** Success / ready / readiness met. */
  moss: "#6D7A50",
} as const;

export const font = {
  /** Chapter titles, headings. Fraunces once webfonts land; warm serifs until then. */
  display: '"Fraunces", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  /** Long-form chapter text and show notes. */
  body: '"Source Serif 4", "Iowan Old Style", Palatino, Georgia, serif',
  /** Buttons, timers, metadata — quiet on purpose. */
  ui: 'Seravek, "Avenir Next", system-ui, sans-serif',
  /** Dice logs and readiness stats (the one move kept from the Arcane Signal direction). */
  mono: '"SF Mono", Menlo, Consolas, monospace',
} as const;

/** Canonical voice lines — the tone reference for any copy an adapter emits. */
export const voice = {
  tagline: "Pull up a chair. The story's already started.",
  promptNotification: (characterName: string) =>
    `The DM has a question for ${characterName}. Thirty seconds by the fire?`,
  chapterRelease: (chapterTitle: string, minutes: number, voices: number) =>
    `${chapterTitle} is told — ${minutes} minutes, all ${voices} of you.`,
} as const;
