import { z } from "zod";
import { AtUri, IsoDateTime } from "./ids.js";

/** Lifecycle of a player's voice clone. `ready` is required to voice a chapter. */
export const VoiceStatus = z.enum(["collecting", "training", "ready", "revoked"]);
export type VoiceStatus = z.infer<typeof VoiceStatus>;

/**
 * Zod mirror of game.bardcast.voice.profile. Holds a provider-side model handle
 * and explicit, revocable consent — never raw audio or biometric data. The
 * VoiceCloner port owns the actual model.
 */
export const VoiceProfile = z.object({
  /** Opaque handle to the model held by the VoiceCloner provider. */
  modelRef: z.string().max(300).optional(),
  sampleReplies: z.array(AtUri).max(512).default([]),
  status: VoiceStatus,
  consent: z.boolean(),
  createdAt: IsoDateTime,
});
export type VoiceProfile = z.infer<typeof VoiceProfile>;
