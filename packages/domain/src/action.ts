import { z } from "zod";
import { AtUri, IsoDateTime } from "./ids.js";
import { Item } from "./items.js";
import { RollLogEntry } from "./resolution.js";

/**
 * Zod mirror of game.bardcast.campaign.action: one mechanical thing that
 * happened at the table (an attack, a check, damage, a rest, a sword found).
 * Lives in the campaign's space. IMMUTABLE and append-only: the action log is
 * the record of what happened, and a seat's hit points, conditions and items
 * are what you get by replaying it (`applyActions`).
 *
 * Actions are posted when a chapter is finished, not while it's drafted: the
 * story engine can backtrack out of a branch (docs/story-engine.md §4), and a
 * discarded branch's actions must never reach the log.
 *
 * Story beats ("Gawain hides his fear") are character.stateEvent, not actions.
 */
export const ActionKind = z.enum(["attack", "check", "save", "damage", "heal", "rest", "condition", "item", "other"]);
export type ActionKind = z.infer<typeof ActionKind>;

/** What an action did to one character at the table. */
export const ActionEffect = z.object({
  /** AT-URI of the affected character's profile (matches CampaignSeat.character). */
  target: AtUri,
  /** Hit points gained (positive) or lost (negative). */
  hitPoints: z.number().int().min(-999).max(999).optional(),
  /** Back to full hit points, as after a long rest. Applied before `hitPoints`. */
  restore: z.boolean().optional(),
  conditionsAdded: z.array(z.string().max(80)).max(8).default([]),
  conditionsRemoved: z.array(z.string().max(80)).max(8).default([]),
  itemsGained: z.array(Item).max(8).default([]),
  /** Ids of items lost, broken or given away. */
  itemsLost: z.array(z.string().max(64)).max(8).default([]),
  /** Items replaced by id: an upgrade (+1), equipping or unequipping. */
  itemsChanged: z.array(Item).max(8).default([]),
});
export type ActionEffect = z.infer<typeof ActionEffect>;

export const CampaignAction = z.object({
  campaign: AtUri,
  /** The chapter this happened in. */
  chapter: AtUri,
  /** The beat within the chapter (ChapterBeat.index). */
  beat: z.number().int().min(0),
  /** Who acted: a character's profile AT-URI, or an NPC's name. */
  actor: z.string().min(1).max(300),
  kind: ActionKind,
  /** One line for the log, e.g. "Gawain swings at the Green Knight". */
  label: z.string().min(1).max(300),
  roll: RollLogEntry.optional(),
  effects: z.array(ActionEffect).max(16).default([]),
  createdAt: IsoDateTime,
});
export type CampaignAction = z.infer<typeof CampaignAction>;

/** A seat's running state at the table. Derived from its starting items plus the action log. */
export const SeatState = z.object({
  hitPoints: z.number().int().min(0),
  conditions: z.array(z.string().max(80)).max(16).default([]),
  items: z.array(Item).max(64).default([]),
});
export type SeatState = z.infer<typeof SeatState>;

/**
 * Replay the action log for one character: start at full health with their
 * starting items, apply each effect aimed at them in order. Hit points stay
 * between 0 and `maxHitPoints`.
 */
export function applyActions(input: {
  character: string;
  maxHitPoints: number;
  startingItems: Item[];
  actions: CampaignAction[];
}): SeatState {
  let hitPoints = input.maxHitPoints;
  const conditions = new Set<string>();
  let items = input.startingItems.map((i) => ({ ...i }));

  for (const action of input.actions) {
    for (const effect of action.effects) {
      if (effect.target !== input.character) continue;
      if (effect.restore) hitPoints = input.maxHitPoints;
      if (effect.hitPoints) hitPoints = Math.max(0, Math.min(input.maxHitPoints, hitPoints + effect.hitPoints));
      effect.conditionsAdded.forEach((c) => conditions.add(c));
      effect.conditionsRemoved.forEach((c) => conditions.delete(c));
      const lost = new Set(effect.itemsLost);
      items = items.filter((i) => !lost.has(i.id));
      for (const changed of effect.itemsChanged) items = items.map((i) => (i.id === changed.id ? changed : i));
      const ids = new Set(items.map((i) => i.id));
      items.push(...effect.itemsGained.filter((i) => !ids.has(i.id)));
    }
  }
  return { hitPoints, conditions: [...conditions], items };
}
