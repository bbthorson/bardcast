import type { AtUri, VoiceProfile } from "@bardcast/domain";
import type { VoiceCloner } from "../ports/voice-cloner.js";

/**
 * Stub VoiceCloner — marks a voice "ready" once it has accumulated enough
 * samples, without contacting a provider. TODO(bardcast): real adapter calling
 * a voice-cloning provider; `modelRef` becomes the provider's model handle.
 */
export class StubVoiceCloner implements VoiceCloner {
  async createIvc(input: { characterId: string; sampleAudioUrls: string[] }): Promise<string> {
    // Generate a stub model reference indicating an IVC created from samples
    return `stub-voice-ivc:${input.characterId}-${input.sampleAudioUrls.length}-samples`;
  }

  async linkSharedPvc(input: { sharingLink: string }): Promise<string> {
    // Import the shared ElevenLabs voice ID reference from the link
    const voiceId = input.sharingLink.split("/").pop() || "unknown";
    return `elevenlabs-pvc:${voiceId}`;
  }

  async revoke(modelRef: string): Promise<void> {
    // no-op for the stub
  }
}

