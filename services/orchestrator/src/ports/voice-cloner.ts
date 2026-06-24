import type { AtUri, VoiceProfile } from "@bardcast/domain";

/**
 * Owns voice models. Bardcast stores only an opaque `modelRef` + consent in the
 * VoiceProfile; the actual model lives with the provider behind this port.
 */
export interface VoiceCloner {
  /**
   * Add/refresh training samples (vox-pop reply audio) for a player's voice and
   * return the updated profile (status may advance collecting → training → ready).
   */
  train(input: { characterId: string; sampleReplies: AtUri[]; consent: boolean }): Promise<VoiceProfile>;

  /** Current model status. */
  status(modelRef: string): Promise<VoiceProfile["status"]>;

  /** Honour a consent revocation: delete the model. */
  revoke(modelRef: string): Promise<void>;
}
