import { z } from "zod";
import { SeatState } from "./action.js";
import { Trait } from "./character.js";
import { AtUri, IsoDateTime, StrongRef } from "./ids.js";
import { equipmentAfter, Item, sameItems, type GearPolicy } from "./items.js";
import {
  Advancement,
  CharacterSheet,
  levelOf,
  MAX_LEVEL,
  nextVersion,
  playSheet,
  sameAdvancement,
  sameBase,
  sheetAtLevel,
  type PlayedSheet,
} from "./sheet.js";

/**
 * A character at one table: a branch of the player's sheet
 * (docs/character-creation.md, "A seat is a branch").
 *
 * `brought` is a snapshot of the sheet as it sat down, already reset to the
 * table's starting level. It's kept whole because the player can delete their
 * own records: the StrongRef in `sheet` proves where it came from, the snapshot
 * keeps the table playable. Levels earned here go in `advancements`.
 *
 * Hit points, conditions and items are campaign-specific. `startingItems` is
 * what they sat down with (per the campaign's gear policy); `state` is a
 * snapshot derived from those plus the campaign's action log (`applyActions`),
 * refreshed when a chapter's actions are committed. None of it touches the
 * player's own sheet until the seat closes and they bring it home.
 *
 * The seat also carries what replies to THIS campaign's prompts taught us
 * (`traits`, `sourceReplies`): that signal is campaign-scoped and feeds the
 * readiness gate.
 */
export const CampaignSeat = z.object({
  campaign: AtUri,
  /** AT-URI of the character.profile in the player's repo. */
  character: AtUri,
  /** The sheet version brought to the table. Absent until the player brings one. */
  sheet: StrongRef.optional(),
  /** The table's starting level when the character sat down. */
  startingLevel: z.number().int().min(1).max(MAX_LEVEL).default(1),
  /** The sheet as it sat down, reset to `startingLevel` (or lower, if it hadn't reached it). */
  brought: CharacterSheet.optional(),
  /** Levels gained at this table, continuing from `brought`. */
  advancements: z.array(Advancement).max(MAX_LEVEL - 1).default([]),
  /** What they sat down with: the starting kit, or their own equipment. */
  startingItems: z.array(Item).max(64).default([]),
  /** Derived from startingItems + the action log. Absent until the first actions are committed. */
  state: SeatState.optional(),
  /** When the character left the table or the campaign ended. Progress comes home only after this. */
  closedAt: IsoDateTime.optional(),
  /** Reply-inferred traits from this campaign's prompts. */
  traits: z.array(Trait).max(64).default([]),
  /** Antiphony replies to this campaign's prompts (provenance). */
  sourceReplies: z.array(AtUri).max(512).default([]),
  createdAt: IsoDateTime,
});
export type CampaignSeat = z.infer<typeof CampaignSeat>;

/**
 * Sit a character down at a table. A sheet above the starting level is
 * replayed down to it; a sheet below it sits at its own level, and
 * `pendingLevels` on the played seat says how many advancements the player
 * still has to choose. The gear policy decides what they carry in.
 */
export function joinCampaign(input: {
  campaign: string;
  sheet: CharacterSheet;
  sheetRef: StrongRef;
  startingLevel: number;
  /** Absent means "starting". */
  gearPolicy?: GearPolicy;
  /** The table's starting kit for this character (used when the policy is "starting"). */
  startingKit?: Item[];
  createdAt: string;
}): CampaignSeat {
  const level = Math.min(input.startingLevel, levelOf(input.sheet));
  const startingItems =
    input.gearPolicy === "bring"
      ? input.sheet.equipment.map((i) => ({ ...i, source: "brought" as const }))
      : (input.startingKit ?? []).map((i) => ({ ...i, source: "start" as const }));
  return {
    campaign: input.campaign as CampaignSeat["campaign"],
    character: input.sheet.character,
    sheet: input.sheetRef,
    startingLevel: input.startingLevel,
    brought: sheetAtLevel(input.sheet, level),
    advancements: [],
    startingItems,
    traits: [],
    sourceReplies: [],
    createdAt: input.createdAt,
  };
}

/** The sheet as it stands at this table: what was brought plus what was earned here. */
export function seatSheet(seat: CampaignSeat): CharacterSheet | null {
  if (!seat.brought) return null;
  const sheet = { ...seat.brought, advancements: [...seat.brought.advancements, ...seat.advancements] };
  const parsed = CharacterSheet.safeParse(sheet);
  if (!parsed.success) throw new Error(`seat's levels don't follow on from the sheet it brought: ${parsed.error.message}`);
  return parsed.data;
}

export interface PlayedSeat extends PlayedSheet {
  /** Advancements still owed to reach the table's starting level. */
  pendingLevels: number;
  /** Current hit points (never above the maximum). */
  hitPoints: number;
  conditions: string[];
  items: Item[];
}

export function playSeat(seat: CampaignSeat): PlayedSeat | null {
  const sheet = seatSheet(seat);
  if (!sheet) return null;
  const played = playSheet(sheet);
  return {
    ...played,
    pendingLevels: Math.max(0, seat.startingLevel - played.level),
    hitPoints: Math.min(seat.state?.hitPoints ?? played.maxHitPoints, played.maxHitPoints),
    conditions: seat.state?.conditions ?? [],
    items: seat.state?.items ?? seat.startingItems,
  };
}

/**
 * What happens when a player brings a character's progress home from a table.
 * Only a closed seat comes home: levels and gear stay with the campaign until
 * it ends or the character leaves. Hit points and conditions never come home.
 *
 * - `seat-open`: the campaign is still going.
 * - `nothing-new`: no levels past their own sheet, and no gear to carry.
 * - `update`: a NEW version to write (`prev` = their current one) with the
 *   table's levels, if the current version is still where the table branched
 *   from, and the gear they carried out.
 * - `diverged`: both have levelled differently since (another table, an edit).
 *   The player chooses; `chooseHistory` makes the version for that choice.
 *
 * Nothing is overwritten: the seat is unchanged, and earlier versions stay in
 * the player's history.
 */
export type HomeComing =
  | { kind: "seat-open" }
  | { kind: "nothing-new" }
  | { kind: "update"; sheet: CharacterSheet }
  | { kind: "diverged"; fromLevel: number; table: CharacterSheet; equipment: Item[] };

export interface Home {
  /** The player's current sheet version and its ref. */
  current: CharacterSheet;
  currentRef: StrongRef;
  /** The seat's own AT-URI, recorded on the new version as `fromSeat`. */
  seatUri: string;
  now: string;
}

export function bringHome(seat: CampaignSeat, home: Home): HomeComing {
  if (!seat.closedAt) return { kind: "seat-open" };
  const { current } = home;
  const equipment = equipmentAfter(current.equipment, seat.startingItems, seat.state?.items ?? seat.startingItems);
  const table = seatSheet(seat);

  if (table && levelOf(table) > levelOf(current)) {
    if (!sameBase(current, table)) return { kind: "diverged", fromLevel: 1, table, equipment };
    const shared = current.advancements.findIndex((a, i) => !sameAdvancement(a, table.advancements[i]!));
    if (shared !== -1) return { kind: "diverged", fromLevel: shared + 2, table, equipment };
    return { kind: "update", sheet: newVersion(home, equipment, table) };
  }
  if (!sameItems(equipment, current.equipment)) return { kind: "update", sheet: newVersion(home, equipment) };
  return { kind: "nothing-new" };
}

/**
 * Resolve a divergence. "table" takes the table's levels; "owned" keeps their
 * own. Gear comes home either way. Null when there's nothing to write.
 */
export function chooseHistory(
  diverged: Extract<HomeComing, { kind: "diverged" }>,
  choice: "table" | "owned",
  home: Home,
): CharacterSheet | null {
  if (choice === "table") return newVersion(home, diverged.equipment, diverged.table);
  return sameItems(diverged.equipment, home.current.equipment) ? null : newVersion(home, diverged.equipment);
}

/** A new version: the current sheet's narrative face, the gear carried home, and (optionally) the table's mechanics. */
function newVersion(home: Home, equipment: Item[], table?: CharacterSheet): CharacterSheet {
  const mechanics = table
    ? { class: table.class, abilities: table.abilities, features: table.features, advancements: table.advancements }
    : {};
  return CharacterSheet.parse({
    ...nextVersion(home.current, home.currentRef, { ...mechanics, equipment }, home.now),
    fromSeat: home.seatUri,
  });
}
