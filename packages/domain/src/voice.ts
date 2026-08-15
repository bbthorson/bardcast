import { z } from "zod";
import { AtUri, IsoDateTime } from "./ids.js";

/** Lifecycle of a player's voice clone. */
export const VoiceStatus = z.enum(["unlinked", "ivc", "pvc"]);
export type VoiceStatus = z.infer<typeof VoiceStatus>;

/**
 * Zod mirror of game.bardcast.voice.profile. Holds a provider-side model handle
 * (ElevenLabs voiceId) and explicit, revocable consent.
 */
export const VoiceProfile = z.object({
  /** Opaque handle to the model held by the VoiceCloner provider (e.g. voice_id). */
  modelRef: z.string().max(300).optional(),
  status: VoiceStatus,
  consent: z.boolean(),
  createdAt: IsoDateTime,
});
export type VoiceProfile = z.infer<typeof VoiceProfile>;

