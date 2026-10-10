import { getClass } from "@bardcast/srd";
import { z } from "zod";
import { AtUri, IsoDateTime, StrongRef } from "./ids.js";
import { Item } from "./items.js";
import { ABILITY_SCORES, type AbilityScore } from "./traits.js";

/**
 * The player-owned 5e sheet and the arithmetic over it (D&D SRD 5.2,
 * CC-BY-4.0). A sheet is level-1 choices plus an advancement log, one entry per
 * level gained, so it can be replayed to any lower level: a level-8 character
 * joining a table that starts at 3 sits down as their level-3 self
 * (docs/character-creation.md, "Resetting to a level").
 *
 * Everything here is pure and deterministic, like resolution.ts.
 */

export const MAX_LEVEL = 20;

/** SRD 5.2 standard array, placed by the player (Clef may only suggest). */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** The SRD 5.2 class indexes, the sheet's `class` vocabulary. */
export const SRD_CLASS_INDEXES = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
] as const;

/**
 * A class's hit die, read from @bardcast/srd so there's one source for SRD
 * numbers. A function, not a table built at load, so apps that never compute a
 * sheet don't bundle the SRD data.
 */
export function hitDieOf(index: SrdClass): number {
  const data = getClass(index);
  if (!data) throw new Error(`@bardcast/srd has no class ${index}`);
  return data.hitDie;
}

export type SrdClass = (typeof SRD_CLASS_INDEXES)[number];
export const SrdClass = z.enum(SRD_CLASS_INDEXES);

const Score = z.number().int().min(1).max(30);

export const AbilityScores = z.object({
  strength: Score,
  dexterity: Score,
  constitution: Score,
  intelligence: Score,
  wisdom: Score,
  charisma: Score,
});
export type AbilityScores = z.infer<typeof AbilityScores>;

/** One level gained. Hit points are the roll (or fixed value) before the Constitution modifier. */
export const Advancement = z.object({
  level: z.number().int().min(2).max(MAX_LEVEL),
  hitPoints: z.number().int().min(1).max(12),
  /** An ability-score increase taken at this level, e.g. { dexterity: 2 }. */
  abilityIncreases: z.partialRecord(z.enum(ABILITY_SCORES), z.number().int().min(1).max(2)).optional(),
  feat: z.string().max(80).optional(),
  features: z.array(z.string().max(120)).max(16).default([]),
  createdAt: IsoDateTime,
});
export type Advancement = z.infer<typeof Advancement>;

/** A personality trait or quirk on the narrative face of the sheet. */
const SheetTrait = z.object({
  name: z.string().max(80),
  value: z.string().max(200).optional(),
});

/**
 * Zod mirror of game.bardcast.character.sheet. PLAYER-OWNED: lives in the
 * player's repo and travels with them. The narrative face (traits, quirks) is
 * what a player sees first; the 5e backbone is underneath.
 *
 * IMMUTABLE VERSIONS: a sheet record is never edited. Every change (a level
 * gained at home, progress brought home, an edit) is a new record whose `prev`
 * points at the version it replaces, like a reply pointing at its parent. The
 * character's profile points at the current version. Two versions sharing a
 * `prev` are a fork. A campaign never writes one; it branches a CampaignSeat.
 */
export const CharacterSheet = z
  .object({
    /** AT-URI of the character.profile this sheet belongs to. */
    character: AtUri,
    class: SrdClass,
    species: z.string().max(60).optional(),
    background: z.string().max(60).optional(),
    /** Level-1 scores, after the background's increases (SRD 5.2). Increases live in `advancements`. */
    abilities: AbilityScores,
    /** Level-1 features. */
    features: z.array(z.string().max(120)).max(32).default([]),
    /** Levels 2..n in order. The sheet's level is 1 + its length. */
    advancements: z.array(Advancement).max(MAX_LEVEL - 1).default([]),
    /** Personality, from the closed vocabulary in traits.ts. */
    traits: z.array(SheetTrait).max(32).default([]),
    /** Free-text quirks, the lines a player reads first. */
    quirks: z.array(z.string().max(200)).max(8).default([]),
    /** Permanent equipment. A campaign's gear policy decides whether it comes to the table. */
    equipment: z.array(Item).max(64).default([]),
    /** The version this one replaces. Absent on a character's first sheet. */
    prev: StrongRef.optional(),
    /** The campaign seat this version's levels came from, when progress was brought home. */
    fromSeat: AtUri.optional(),
    /** When this version was made. Versions are never edited, so there's no updatedAt. */
    createdAt: IsoDateTime,
  })
  .refine((s) => s.advancements.every((a, i) => a.level === i + 2), {
    message: "advancements must run 2, 3, 4… with no gaps",
    path: ["advancements"],
  });
export type CharacterSheet = z.infer<typeof CharacterSheet>;

/**
 * The next version of a sheet: the change applied, `prev` pointing at the
 * version it replaces. The old version is untouched; write this as a new record.
 */
export function nextVersion(
  current: CharacterSheet,
  currentRef: StrongRef,
  change: Partial<Omit<CharacterSheet, "character" | "prev" | "createdAt">>,
  now: string,
): CharacterSheet {
  const { fromSeat: _drop, ...base } = current;
  return CharacterSheet.parse({ ...base, ...change, prev: currentRef, createdAt: now });
}

/** A level gained outside any campaign, as a new version. */
export function levelUp(current: CharacterSheet, currentRef: StrongRef, advancement: Advancement, now: string): CharacterSheet {
  return nextVersion(current, currentRef, { advancements: [...current.advancements, advancement] }, now);
}

/** The sheet's own level. */
export function levelOf(sheet: Pick<CharacterSheet, "advancements">): number {
  return 1 + sheet.advancements.length;
}

/** SRD proficiency bonus by level. */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

/**
 * The sheet replayed to `level`: advancements above it are dropped. Throws if
 * the sheet hasn't reached that level; a table that starts higher asks the
 * player for the missing advancements instead (see CampaignSeat).
 */
export function sheetAtLevel(sheet: CharacterSheet, level: number): CharacterSheet {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level must be 1–${MAX_LEVEL}, got ${level}`);
  }
  if (level > levelOf(sheet)) {
    throw new RangeError(`sheet is level ${levelOf(sheet)}, can't replay to ${level}`);
  }
  return { ...sheet, advancements: sheet.advancements.slice(0, level - 1) };
}

/** What the arithmetic says about a sheet: the numbers a table plays with. */
export interface PlayedSheet {
  level: number;
  class: SrdClass;
  abilities: AbilityScores;
  maxHitPoints: number;
  proficiencyBonus: number;
  features: string[];
}

const modifier = (score: number) => Math.floor((score - 10) / 2);

/** Derive the played numbers. Ability scores cap at 20; Constitution counts for every level. */
export function playSheet(sheet: Pick<CharacterSheet, "class" | "abilities" | "features" | "advancements">): PlayedSheet {
  const abilities = { ...sheet.abilities };
  for (const adv of sheet.advancements) {
    for (const ability of ABILITY_SCORES) {
      const inc = adv.abilityIncreases?.[ability];
      if (inc) abilities[ability] = Math.min(20, abilities[ability] + inc);
    }
  }
  const level = levelOf(sheet);
  const con = modifier(abilities.constitution);
  const perLevel = [hitDieOf(sheet.class), ...sheet.advancements.map((a) => a.hitPoints)];
  // Each level gives at least 1 hit point, whatever the Constitution.
  const maxHitPoints = perLevel.reduce((sum, hp) => sum + Math.max(1, hp + con), 0);
  return {
    level,
    class: sheet.class,
    abilities,
    maxHitPoints,
    proficiencyBonus: proficiencyBonus(level),
    features: [...sheet.features, ...sheet.advancements.flatMap((a) => [...a.features, ...(a.feat ? [a.feat] : [])])],
  };
}

/** Two advancements are the same level-up if everything but the timestamp matches. */
export function sameAdvancement(a: Advancement, b: Advancement): boolean {
  const inc = (x: Advancement) =>
    ABILITY_SCORES.map((k) => x.abilityIncreases?.[k] ?? 0).join(",");
  return (
    a.level === b.level &&
    a.hitPoints === b.hitPoints &&
    inc(a) === inc(b) &&
    (a.feat ?? "") === (b.feat ?? "") &&
    a.features.join("\u0000") === b.features.join("\u0000")
  );
}

/** Two sheets share a level-1 self if class and starting scores match. */
export function sameBase(a: Pick<CharacterSheet, "class" | "abilities">, b: Pick<CharacterSheet, "class" | "abilities">): boolean {
  return a.class === b.class && ABILITY_SCORES.every((k: AbilityScore) => a.abilities[k] === b.abilities[k]);
}
