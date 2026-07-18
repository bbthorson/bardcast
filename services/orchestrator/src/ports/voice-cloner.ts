import type { AtUri, VoiceProfile } from "@bardcast/domain";

/**
 * Owns voice models. Bardcast stores only an opaque `modelRef` + consent in the
 * VoiceProfile; the actual model lives with the provider behind this port.
 */
export interface VoiceCloner {
  /**
   * Create an Instant Voice Clone (IVC) using a list of audio URLs
   * (e.g. from Antiphony prompt replies) and return the generated voice_id.
   */
  createIvc(input: { characterId: string; sampleAudioUrls: string[] }): Promise<string>;

  /**
   * Import an ElevenLabs Professional Voice Clone (PVC) shared via a private link.
   * Calls POST /v1/voices/add/{public_user_id}/{voice_id} under the hood.
   * Returns the imported voice_id.
   */
  linkSharedPvc(input: { sharingLink: string }): Promise<string>;

  /** Honour a consent revocation: remove the model link. */
  revoke(modelRef: string): Promise<void>;
}

