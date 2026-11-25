import { z } from "zod";
import type { CharacterProfile } from "./character.js";
import { AtUri, Did } from "./ids.js";
import { Item, type ItemKind } from "./items.js";
import {
  AbilityScores,
  SRD_CLASS_INDEXES,
  SrdClass,
  playSheet,
  type CharacterSheet,
} from "./sheet.js";

/**
 * Interoperability layer for the `rpg.actor` AT Protocol lexicon family
 * (`actor.rpg.stats`, `actor.rpg.sprite`, `equipment.rpg.item`, `equipment.rpg.give`).
 *
 * Per CLAUDE.md, Bardcast's own state drives derived records, never the reverse.
 * These schemas and pure mappers let Bardcast:
 *  - Read public `actor.rpg.stats/dnd` (and legacy `self`) records to seed a character;
 *  - Read `actor.rpg.sprite/self` (including `emotes.*.talkSheet` for future sprite-trail playback);
 *  - Read verified `equipment.rpg.item` keepsakes for the narrative engine;
 *  - Project a Bardcast `CharacterSheet` out to `actor.rpg.stats/dnd` (and `actor.rpg.stats/bardcast`).
 */

export const RpgActorCollections = {
  stats: "actor.rpg.stats",
  sprite: "actor.rpg.sprite",
  generator: "actor.rpg.generator",
  master: "actor.rpg.master",
  equipmentItem: "equipment.rpg.item",
  equipmentGive: "equipment.rpg.give",
} as const;

/** Standard rpg.actor sprite dimensions (144×192 PNG, 3 cols × 4 rows, 48×48 per frame). */
export const RPG_ACTOR_SPRITE_DEFAULTS = {
  frameWidth: 48,
  frameHeight: 48,
  columns: 3,
  rows: 4,
  idleFrame: 1,
  walkOrder: [0, 1, 2, 1] as const,
  frameDurationMs: 150,
} as const;

export const RPG_ACTOR_EMOTE_STATES = [
  "neutral",
  "blink",
  "happy",
  "sad",
  "angry",
  "silly",
  "tired",
  "bruh",
  "pout",
] as const;
export type RpgActorEmoteState = (typeof RPG_ACTOR_EMOTE_STATES)[number];
export const RpgActorEmoteState = z.enum(RPG_ACTOR_EMOTE_STATES);

/** Minimal AT Protocol blob reference (matches both raw JSON and IPLD-decoded refs). */
export const RpgActorBlobRef = z.looseObject({
  $type: z.literal("blob").optional(),
  ref: z.union([
    z.object({ $link: z.string().min(1) }),
    z.string().min(1),
  ]),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
});
export type RpgActorBlobRef = z.infer<typeof RpgActorBlobRef>;

/** Extract the CID string from a blob ref, regardless of `$link` wrapper. */
export function blobRefCid(blob: RpgActorBlobRef | undefined | null): string | null {
  if (!blob) return null;
  if (typeof blob.ref === "string") return blob.ref;
  return blob.ref.$link || null;
}

// --- actor.rpg.stats (D&D 5e subset, forward-compatible) ---------------------

const IntScore = z.number().int().min(1).max(30);

export const RpgActorDndIdentity = z.looseObject({
  race: z.string().max(100).optional(),
  class: z.string().max(100).optional(),
  level: z.number().int().min(1).max(20).optional(),
  background: z.string().max(100).optional(),
  alignment: z.string().max(50).optional(),
  xp: z.number().int().min(0).optional(),
  proficiency: z.number().int().min(0).optional(),
});
export type RpgActorDndIdentity = z.infer<typeof RpgActorDndIdentity>;

export const RpgActorDndAbilities = z.looseObject({
  str: IntScore.optional(),
  dex: IntScore.optional(),
  con: IntScore.optional(),
  int: IntScore.optional(),
  wis: IntScore.optional(),
  cha: IntScore.optional(),
});
export type RpgActorDndAbilities = z.infer<typeof RpgActorDndAbilities>;

export const RpgActorDndHp = z.looseObject({
  current: z.number().int().min(0).optional(),
  max: z.number().int().min(1).optional(),
  temp: z.number().int().min(0).optional(),
});
export type RpgActorDndHp = z.infer<typeof RpgActorDndHp>;

export const RpgActorDndCombat = z.looseObject({
  ac: z.number().int().min(0).optional(),
  speed: z.number().int().min(0).optional(),
  initiative: z.number().int().optional(),
  hitDice: z.string().max(20).optional(),
  hitDiceUsed: z.number().int().min(0).optional(),
});
export type RpgActorDndCombat = z.infer<typeof RpgActorDndCombat>;

export const RpgActorDndEquipment = z.looseObject({
  weapons: z.string().max(500).optional(),
  armor: z.string().max(200).optional(),
  gear: z.string().max(2000).optional(),
  treasure: z.string().max(1000).optional(),
});
export type RpgActorDndEquipment = z.infer<typeof RpgActorDndEquipment>;

export const RpgActorDndPersonality = z.looseObject({
  traits: z.string().max(1000).optional(),
  ideals: z.string().max(500).optional(),
  bonds: z.string().max(500).optional(),
  flaws: z.string().max(500).optional(),
  backstory: z.string().max(5000).optional(),
});
export type RpgActorDndPersonality = z.infer<typeof RpgActorDndPersonality>;

export const RpgActorDndStats = z.looseObject({
  identity: RpgActorDndIdentity.optional(),
  abilities: RpgActorDndAbilities.optional(),
  hp: RpgActorDndHp.optional(),
  combat: RpgActorDndCombat.optional(),
  equipment: RpgActorDndEquipment.optional(),
  personality: RpgActorDndPersonality.optional(),
  proficiencies: z.string().optional(),
  languages: z.string().optional(),
  features: z.string().optional(),
});
export type RpgActorDndStats = z.infer<typeof RpgActorDndStats>;

/**
 * Extract `dnd` stats from either the current per-system record
 * (`actor.rpg.stats/dnd` with `{ system: "dnd", data }`) or the deprecated
 * `actor.rpg.stats/self` record (`{ dnd }`).
 */
export function extractRpgActorDndStats(record: unknown): RpgActorDndStats | null {
  if (!record || typeof record !== "object") return null;
  const obj = record as Record<string, unknown>;
  const candidate =
    obj.system === "dnd" && obj.data && typeof obj.data === "object"
      ? obj.data
      : obj.dnd && typeof obj.dnd === "object"
        ? obj.dnd
        : null;
  if (!candidate) return null;
  const parsed = RpgActorDndStats.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// --- actor.rpg.sprite (raw record + resolved URL view) -----------------------

export const RpgActorSpriteEmoteRecord = z.looseObject({
  label: z.string().optional(),
  emoteSheet: RpgActorBlobRef.optional(),
  talkSheet: RpgActorBlobRef.optional(),
});

export const RpgActorSpriteRecord = z.looseObject({
  spriteSheet: RpgActorBlobRef.optional(),
  frameWidth: z.number().int().positive().optional(),
  frameHeight: z.number().int().positive().optional(),
  columns: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  source: z.string().optional(),
  emotes: z.looseObject({
    version: z.union([z.string(), z.number()]).optional(),
    generatedAt: z.string().optional(),
  }).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type RpgActorSpriteRecord = z.infer<typeof RpgActorSpriteRecord>;

export const RpgActorSpriteEmoteView = z.object({
  label: z.string().optional(),
  emoteUrl: z.string().url(),
  talkUrl: z.string().url().optional(),
});
export type RpgActorSpriteEmoteView = z.infer<typeof RpgActorSpriteEmoteView>;

export const RpgActorSpriteView = z.object({
  sheetUrl: z.string().url(),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  source: AtUri.optional(),
  /** Optional expression sheets (closed-mouth + open-mouth talkSheet) for podcast playback. */
  emotes: z.partialRecord(RpgActorEmoteState, RpgActorSpriteEmoteView).optional(),
});
export type RpgActorSpriteView = z.infer<typeof RpgActorSpriteView>;

// --- equipment.rpg.item / equipment.rpg.give ---------------------------------

export const RpgActorEquipmentItem = z.object({
  item: z.string().min(1).max(120),
  title: z.string().min(1).max(160),
  kind: z.enum(["layer", "inventory"]).optional(),
  category: z.string().max(64).optional(),
  description: z.string().max(1000).optional(),
  context: z.string().max(500).optional(),
  provider: Did,
  give: AtUri.optional(),
  verified: z.boolean().default(false),
  assetUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
});
export type RpgActorEquipmentItem = z.infer<typeof RpgActorEquipmentItem>;

/** Everything Bardcast reads for one DID from the rpg.actor ecosystem. */
export const RpgActorProfile = z.object({
  did: Did,
  pdsUrl: z.string().url().optional(),
  dnd: RpgActorDndStats.optional(),
  sprite: RpgActorSpriteView.optional(),
  equipment: z.array(RpgActorEquipmentItem).default([]),
});
export type RpgActorProfile = z.infer<typeof RpgActorProfile>;

// --- Pure mappers: rpg.actor ↔ Bardcast --------------------------------------

export const RpgActorImportDraft = z.object({
  displayName: z.string().min(1).max(120).optional(),
  class: SrdClass.optional(),
  species: z.string().max(60).optional(),
  background: z.string().max(60).optional(),
  abilities: AbilityScores,
  abilitiesComplete: z.boolean(),
  level: z.number().int().min(1).max(20),
  concept: z.string().max(300).optional(),
  drives: z.array(z.string().max(200)).max(32),
  quirks: z.array(z.string().max(200)).max(8),
  features: z.array(z.string().max(120)).max(32),
  equipment: z.array(Item).max(64),
  notes: z.array(z.string()),
});
export type RpgActorImportDraft = z.infer<typeof RpgActorImportDraft>;

const SRD_CLASS_SET = new Set<string>(SRD_CLASS_INDEXES);

/** Match a free-text rpg.actor class string (e.g. "Paladin", "Fighter 3") to an SRD 5.2 class. */
export function normalizeSrdClass(raw: string | undefined): SrdClass | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().toLowerCase();
  if (SRD_CLASS_SET.has(cleaned)) return cleaned as SrdClass;
  // Handle multiclass or level suffixes like "Fighter 3" or "Rogue / Bard"
  const tokens = cleaned.split(/[^a-z]+/).filter(Boolean);
  for (const token of tokens) {
    if (SRD_CLASS_SET.has(token)) return token as SrdClass;
  }
  return undefined;
}

function clamp(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function splitEntries(raw: string | undefined, maxItemLen: number, maxItems: number): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[\n;]+/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (out.length >= maxItems) break;
    const clipped = clamp(part, maxItemLen);
    if (clipped) out.push(clipped);
  }
  return out;
}

function parseEquipmentText(raw: string | undefined, kind: ItemKind, prefix: string): Item[] {
  if (!raw) return [];
  const parts = raw
    .split(/[\n,;]+/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  const items: Item[] = [];
  for (let i = 0; i < parts.length; i++) {
    const name = clamp(parts[i], 120);
    if (!name) continue;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    items.push({
      id: `${prefix}-${slug || i + 1}-${i + 1}`,
      name,
      kind,
      bonus: 0,
      equipped: false,
      source: "brought",
    });
  }
  return items;
}

/**
 * Pure mapping from an `actor.rpg.stats/dnd` record into a Bardcast import draft.
 * Never mutates external records; flags anything that needs player confirmation
 * (e.g. unrecognized class, partial ability scores, or level > 1).
 */
export function fromRpgActorDndStats(
  dnd: RpgActorDndStats,
  opts: { displayName?: string } = {},
): RpgActorImportDraft {
  const notes: string[] = [];
  const rawClass = dnd.identity?.class;
  const matchedClass = normalizeSrdClass(rawClass);
  if (rawClass && !matchedClass) {
    notes.push(`Class "${rawClass}" isn't in SRD 5.2; pick a class before saving.`);
  }

  const ab = dnd.abilities;
  const abilitiesComplete = Boolean(
    ab?.str !== undefined &&
      ab?.dex !== undefined &&
      ab?.con !== undefined &&
      ab?.int !== undefined &&
      ab?.wis !== undefined &&
      ab?.cha !== undefined,
  );
  if (!abilitiesComplete) {
    notes.push("Some ability scores were missing on rpg.actor and defaulted to 10.");
  }

  const abilities: AbilityScores = {
    strength: ab?.str ?? 10,
    dexterity: ab?.dex ?? 10,
    constitution: ab?.con ?? 10,
    intelligence: ab?.int ?? 10,
    wisdom: ab?.wis ?? 10,
    charisma: ab?.cha ?? 10,
  };

  const level = dnd.identity?.level ?? 1;
  if (level > 1) {
    notes.push(
      `rpg.actor lists level ${level}, without per-level advancement history; imported at level 1 so campaigns can replay cleanly.`,
    );
  }

  const species = clamp(dnd.identity?.race, 60);
  const background = clamp(dnd.identity?.background, 60);

  // Concept: first sentence of backstory if present, else a compact identity line.
  const backstoryFirstSentence = dnd.personality?.backstory
    ?.trim()
    .split(/(?<=[.!?])\s+/)[0];
  const fallbackConcept = [dnd.identity?.alignment, species, rawClass]
    .filter(Boolean)
    .join(" ");
  const concept = clamp(backstoryFirstSentence || fallbackConcept || undefined, 300);

  const drives = [
    ...splitEntries(dnd.personality?.ideals, 200, 16),
    ...splitEntries(dnd.personality?.bonds, 200, 16),
  ].slice(0, 32);

  const quirks = [
    ...splitEntries(dnd.personality?.traits, 200, 4),
    ...splitEntries(dnd.personality?.flaws, 200, 4),
  ].slice(0, 8);

  const features = splitEntries(dnd.features, 120, 32);

  const equipment = [
    ...parseEquipmentText(dnd.equipment?.weapons, "weapon", "wpn"),
    ...parseEquipmentText(dnd.equipment?.armor, "armor", "arm"),
    ...parseEquipmentText(dnd.equipment?.gear, "gear", "gear"),
  ].slice(0, 64);

  return RpgActorImportDraft.parse({
    ...(opts.displayName ? { displayName: clamp(opts.displayName, 120) } : {}),
    ...(matchedClass ? { class: matchedClass } : {}),
    ...(species ? { species } : {}),
    ...(background ? { background } : {}),
    abilities,
    abilitiesComplete,
    level,
    ...(concept ? { concept } : {}),
    drives,
    quirks,
    features,
    equipment,
    notes,
  });
}

/**
 * Project a Bardcast character (profile + current sheet) into an `actor.rpg.stats/dnd`
 * data payload. Uses `playSheet()` so derived level, ability increases, max HP,
 * proficiency bonus, and features stay consistent with Bardcast's state.
 */
export function toRpgActorDndStats(
  profile: Pick<CharacterProfile, "displayName" | "concept" | "drives">,
  sheet: CharacterSheet,
): RpgActorDndStats {
  const played = playSheet(sheet);
  const weapons = sheet.equipment.filter((i) => i.kind === "weapon").map((i) => i.name);
  const armor = sheet.equipment
    .filter((i) => i.kind === "armor" || i.kind === "shield")
    .map((i) => i.name);
  const gear = sheet.equipment.filter((i) => i.kind === "gear").map((i) => i.name);

  const traitLines = [
    ...sheet.quirks,
    ...sheet.traits.map((t) => (t.value ? `${t.name}: ${t.value}` : t.name)),
  ];

  const equipment: RpgActorDndEquipment = {
    ...(weapons.length > 0 ? { weapons: clamp(weapons.join(", "), 500) } : {}),
    ...(armor.length > 0 ? { armor: clamp(armor.join(", "), 200) } : {}),
    ...(gear.length > 0 ? { gear: clamp(gear.join(", "), 2000) } : {}),
  };

  const personality: RpgActorDndPersonality = {
    ...(traitLines.length > 0 ? { traits: clamp(traitLines.join("\n"), 1000) } : {}),
    ...(profile.drives.length > 0 ? { ideals: clamp(profile.drives.join("\n"), 500) } : {}),
    ...(profile.concept ? { backstory: clamp(profile.concept, 5000) } : {}),
  };

  const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

  return RpgActorDndStats.parse({
    identity: {
      class: capitalize(played.class),
      level: played.level,
      proficiency: played.proficiencyBonus,
      ...(sheet.species ? { race: sheet.species } : {}),
      ...(sheet.background ? { background: sheet.background } : {}),
    },
    abilities: {
      str: played.abilities.strength,
      dex: played.abilities.dexterity,
      con: played.abilities.constitution,
      int: played.abilities.intelligence,
      wis: played.abilities.wisdom,
      cha: played.abilities.charisma,
    },
    hp: {
      current: played.maxHitPoints,
      max: played.maxHitPoints,
    },
    ...(Object.keys(equipment).length > 0 ? { equipment } : {}),
    ...(Object.keys(personality).length > 0 ? { personality } : {}),
    ...(played.features.length > 0 ? { features: played.features.join("\n") } : {}),
  });
}

/**
 * Project Bardcast's narrative-first identity into a custom `actor.rpg.stats/bardcast`
 * system payload (rendered natively by rpg.actor's generic sheet renderer via `_meta.name`).
 */
export function toRpgActorBardcastStats(
  profile: Pick<CharacterProfile, "displayName" | "concept" | "pronouns" | "drives">,
  sheet: CharacterSheet,
): Record<string, unknown> {
  const played = playSheet(sheet);
  return {
    _meta: { name: "Bardcast" },
    name: profile.displayName,
    class: played.class,
    level: played.level,
    ...(profile.pronouns ? { pronouns: profile.pronouns } : {}),
    ...(profile.concept ? { concept: profile.concept } : {}),
    ...(profile.drives.length > 0 ? { drives: profile.drives } : {}),
    ...(sheet.quirks.length > 0 ? { quirks: sheet.quirks } : {}),
  };
}
