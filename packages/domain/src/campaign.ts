import { z } from "zod";
import { AtUri, Did, IsoDateTime, StoryDate } from "./ids.js";

/** Zod mirror of game.bardcast.campaign.campaign. */
export const Campaign = z.object({
  title: z.string().min(1).max(200),
  dm: Did,
  premise: z.string().max(5000).optional(),
  party: z.array(AtUri).max(32).default([]),
  calendar: z.string().max(80).optional(),
  createdAt: IsoDateTime,
});
export type Campaign = z.infer<typeof Campaign>;

/**
 * Chapter pipeline state. The DM is shown "processing" while a chapter is in
 * `writing` or `rendering`.
 */
export const ChapterStatus = z.enum(["drafting", "writing", "rendering", "ready", "failed"]);
export type ChapterStatus = z.infer<typeof ChapterStatus>;

/** Statuses the DM should see surfaced as "audio is processing". */
export const PROCESSING_STATUSES: ReadonlySet<ChapterStatus> = new Set(["writing", "rendering"]);

/** Zod mirror of game.bardcast.campaign.chapter. */
export const Chapter = z.object({
  campaign: AtUri,
  index: z.number().int().min(1),
  title: z.string().min(1).max(300),
  transcript: z.string().max(100000).optional(),
  /** Set once rendered. The blob ref/URL to chapter audio in cloned voices. */
  audioRef: z.string().max(2000).optional(),
  storyDate: StoryDate.optional(),
  status: ChapterStatus,
  createdAt: IsoDateTime,
});
export type Chapter = z.infer<typeof Chapter>;

/**
 * A prompt the DM sends the party. Bridges to vox-pop: when published, this is
 * backed by a com.voxpop.audio.prompt record whose AT-URI is `voxPopPromptUri`.
 * Bardcast adds the campaign framing and the prompt's narrative intent.
 */
export const Prompt = z.object({
  campaign: AtUri,
  /** Short text of the question, mirrored into the vox-pop prompt title. */
  title: z.string().min(1).max(300),
  /** Scene-setting context the DM speaks/writes. */
  scene: z.string().max(3000).optional(),
  /** Which characters this prompt is aimed at (AT-URIs of profiles). */
  audience: z.array(AtUri).max(32).default([]),
  /** What the answer is meant to develop — drives sheet/behavior/voice growth. */
  intent: z.enum(["sheet", "behavior", "voice", "story"]).default("story"),
  /** Set once published to vox-pop-core. */
  voxPopPromptUri: AtUri.optional(),
  createdAt: IsoDateTime,
});
export type Prompt = z.infer<typeof Prompt>;
