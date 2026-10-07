import { z } from "zod";
import { Trait } from "./character.js";
import { AtUri, IsoDateTime, StrongRef } from "./ids.js";
import {
  Advancement,
  CharacterSheet,
  levelOf,
  MAX_LEVEL,
  playSheet,
  sameAdvancement,
  sameBase,
  sheetAtLevel,
  type PlayedSheet,
} from "./sheet.js";

/**
 * A character at one table: a branch of the player's sheet
 * (docs/character-creation.md, "A seat is a branch, not a copy").
 *
 * `brought` is a snapshot of the sheet as it sat down, already reset to the
 * table's starting level. It's kept whole because AT Protocol doesn't serve old
 * record versions: the StrongRef in `sheet` proves where it came from, the
 * snapshot is what the table plays from. Levels earned here go in
 * `advancements`; hit points, conditions and gear go in `state`.
 *
 * The seat also carries what replies to THIS campaign's prompts taught us
 * (`traits`, `sourceReplies`): that signal is campaign-scoped and feeds the
 * readiness gate.
 */
export const SeatState = z.object({
  hitPoints: z.number().int().min(0).optional(),
  conditions: z.array(z.string().max(80)).max(16).default([]),
  gear: z.array(z.string().max(120)).max(64).default([]),
});
export type SeatState = z.infer<typeof SeatState>;

/** Zod mirror of game.bardcast.campaign.seat. Lives in the campaign's space. */
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
  state: SeatState.optional(),
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
 * still has to choose.
 */
export function joinCampaign(input: {
  campaign: string;
  sheet: CharacterSheet;
  sheetRef: StrongRef;
  startingLevel: number;
  createdAt: string;
}): CampaignSeat {
  const level = Math.min(input.startingLevel, levelOf(input.sheet));
  return {
    campaign: input.campaign as CampaignSeat["campaign"],
    character: input.sheet.character,
    sheet: input.sheetRef,
    startingLevel: input.startingLevel,
    brought: sheetAtLevel(input.sheet, level),
    advancements: [],
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
  /** Current hit points: the seat's state, or full health. */
  hitPoints: number;
}

export function playSeat(seat: CampaignSeat): PlayedSeat | null {
  const sheet = seatSheet(seat);
  if (!sheet) return null;
  const played = playSheet(sheet);
  return {
    ...played,
    pendingLevels: Math.max(0, seat.startingLevel - played.level),
    hitPoints: Math.min(seat.state?.hitPoints ?? played.maxHitPoints, played.maxHitPoints),
  };
}

/**
 * What happens when a player brings a character's progress home from a table.
 *
 * - `nothing-new`: the table hasn't taken them past their own sheet's level.
 * - `fast-forward`: their own sheet is still where the table branched from it;
 *   the table's levels simply follow on. `sheet` is the updated owned sheet.
 * - `diverged`: both have levelled differently since (another table, an edit).
 *   The player chooses; `chooseHistory` applies the choice.
 *
 * The seat is never changed: campaign state is kept either way.
 */
export type HomeComing =
  | { kind: "nothing-new" }
  | { kind: "fast-forward"; sheet: CharacterSheet }
  | { kind: "diverged"; fromLevel: number; table: CharacterSheet };

export function bringHome(owned: CharacterSheet, seat: CampaignSeat, now: string): HomeComing {
  const table = seatSheet(seat);
  if (!table || levelOf(table) <= levelOf(owned)) return { kind: "nothing-new" };

  if (!sameBase(owned, table)) return { kind: "diverged", fromLevel: 1, table };
  const shared = owned.advancements.findIndex((a, i) => !sameAdvancement(a, table.advancements[i]!));
  if (shared !== -1) return { kind: "diverged", fromLevel: shared + 2, table };

  return { kind: "fast-forward", sheet: withHistory(owned, table, now) };
}

/** Resolve a divergence. "table" takes the table's history; "owned" keeps the sheet as it is. */
export function chooseHistory(owned: CharacterSheet, table: CharacterSheet, choice: "table" | "owned", now: string): CharacterSheet {
  return choice === "owned" ? owned : withHistory(owned, table, now);
}

/** The owned sheet's narrative face, with the table's mechanics. */
function withHistory(owned: CharacterSheet, table: CharacterSheet, now: string): CharacterSheet {
  return {
    ...owned,
    class: table.class,
    abilities: table.abilities,
    features: table.features,
    advancements: table.advancements,
    updatedAt: now,
  };
}
