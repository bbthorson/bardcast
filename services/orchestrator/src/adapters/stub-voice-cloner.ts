import type { AtUri, VoiceProfile } from "@bardcast/domain";
import type { VoiceCloner } from "../ports/voice-cloner.js";

/**
 * Stub VoiceCloner — marks a voice "ready" once it has accumulated enough
 * samples, without contacting a provider. TODO(bardcast): real adapter calling
 * a voice-cloning provider; `modelRef` becomes the provider's model handle.
 */
export class StubVoiceCloner implements VoiceCloner {
  private static readonly SAMPLES_FOR_READY = 3;

  async train(input: { characterId: string; sampleReplies: AtUri[]; consent: boolean }): Promise<VoiceProfile> {
    const ready = input.sampleReplies.length >= StubVoiceCloner.SAMPLES_FOR_READY;
    return {
      modelRef: `stub-voice:${input.characterId}`,
      sampleReplies: input.sampleReplies,
      status: ready ? "ready" : "collecting",
      consent: input.consent,
      createdAt: new Date().toISOString(),
    };
  }

  async status(): Promise<VoiceProfile["status"]> {
    return "ready";
  }

  async revoke(): Promise<void> {
    // no-op for the stub
  }
}
