import { z } from "zod";
import { AtUri, Did, IsoDateTime, StoryDate } from "./ids.js";

/**
 * Zod mirror of game.bardcast.character.profile. Keep in sync with the lexicon.
 * DURABLE identity: lives in the player's repo (rkey: tid, so a player can
 * have several characters) and is the same in every campaign. Mechanics live
 * on the player-owned CharacterSheet (sheet.ts); what differs between two
 * campaigns lives on each campaign's CampaignSeat (seat.ts).
 */
export const CharacterProfile = z.object({
  player: Did.optional(),
  displayName: z.string().min(1).max(120),
  concept: z.string().max(300).optional(),
  pronouns: z.string().max(40).optional(),
  drives: z.array(z.string().max(200)).max(32).default([]),
  createdAt: IsoDateTime,
});
export type CharacterProfile = z.infer<typeof CharacterProfile>;

/** A single inferred trait. `confidence` feeds the readiness gate. */
export const Trait = z.object({
  name: z.string().max(80),
  value: z.string().max(200).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
});
export type Trait = z.infer<typeof Trait>;

/**
 * A learned, predictive model of how a character behaves — used by the
 * NarrativeWriter to keep generated dialogue in-voice. Kept deliberately open;
 * the first implementation may be a prompt-prefix, a fine-tune ref, or a set of
 * exemplar lines. Not (yet) a published lexicon; lives in app state.
 */
export const BehaviorModel = z.object({
  /** Provider/opaque handle to a model, or null while only exemplars exist. */
  modelRef: z.string().max(300).nullable().default(null),
  /** Representative lines/decisions mined from replies, used as exemplars. */
  exemplars: z.array(z.string().max(1000)).max(256).default([]),
  sourceReplies: z.array(AtUri).max(512).default([]),
  updatedAt: IsoDateTime,
});
export type BehaviorModel = z.infer<typeof BehaviorModel>;

export const Register = z.enum(["public", "private", "under-pressure", "transition"]);
export type Register = z.infer<typeof Register>;

/**
 * Zod mirror of game.bardcast.character.stateEvent. One backdated beat in an
 * arc. The series ordered by createdAt is the scrubbable timeline.
 */
export const CharacterStateEvent = z.object({
  subject: AtUri,
  state: z.string().max(300),
  register: Register.optional(),
  storyDate: StoryDate,
  chapterRef: AtUri.optional(),
  createdAt: IsoDateTime,
});
export type CharacterStateEvent = z.infer<typeof CharacterStateEvent>;
