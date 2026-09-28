import type { VoiceCloner } from "../../ports/voice-cloner.js";

export interface ElevenLabsVoiceClonerConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Production VoiceCloner adapter for ElevenLabs.
 *
 * Implements:
 * 1. Instant Voice Clone (IVC) creation via POST /v1/voices/add using audio samples.
 * 2. Shared Professional Voice Clone (PVC) linking via private share link.
 * 3. Voice model revocation via DELETE /v1/voices/{voice_id}.
 */
export class ElevenLabsVoiceCloner implements VoiceCloner {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ElevenLabsVoiceClonerConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.elevenlabs.io").replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async createIvc(input: { characterId: string; sampleAudioUrls: string[] }): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured.");
    }

    if (input.sampleAudioUrls.length === 0) {
      throw new Error(`Cannot create IVC for ${input.characterId}: no sample audio URLs provided.`);
    }

    const formData = new FormData();
    formData.append("name", `bardcast-${input.characterId}`);
    formData.append("description", `Bardcast instant voice clone for ${input.characterId}`);

    // Download the audio sample blobs
    for (let i = 0; i < input.sampleAudioUrls.length; i++) {
      const url = input.sampleAudioUrls[i]!;
      const audioRes = await this.fetchImpl(url);
      if (!audioRes.ok) {
        throw new Error(`Failed to download audio sample from ${url}: status ${audioRes.status}`);
      }
      const blob = await audioRes.blob();
      formData.append("files", blob, `sample-${i}.webm`);
    }

    const res = await this.fetchImpl(`${this.baseUrl}/v1/voices/add`, {
      method: "POST",
      headers: {
        "xi-api-key": this.config.apiKey,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`ElevenLabs IVC creation failed (${res.status}): ${JSON.stringify(err)}`);
    }

    const data = (await res.json()) as { voice_id: string };
    return data.voice_id;
  }

  async linkSharedPvc(input: { sharingLink: string }): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured.");
    }

    let publicUserId: string | null = null;
    let voiceId: string | null = null;

    try {
      const url = new URL(input.sharingLink);
      const segments = url.pathname.split("/").filter(Boolean);
      const shareIdx = segments.indexOf("share");
      if (shareIdx !== -1 && segments.length >= shareIdx + 3) {
        publicUserId = segments[shareIdx + 1] ?? null;
        voiceId = segments[shareIdx + 2] ?? null;
      } else if (segments.length >= 2) {
        voiceId = segments[segments.length - 1] ?? null;
        publicUserId = segments[segments.length - 2] ?? null;
      } else {
        voiceId = segments[0] ?? null;
      }
    } catch {
      const clean = input.sharingLink.split("?")[0]!.replace(/^\/+|\/+$/g, "");
      const parts = clean.split("/");
      if (parts.length >= 2) {
        publicUserId = parts[parts.length - 2] ?? null;
        voiceId = parts[parts.length - 1] ?? null;
      } else {
        voiceId = parts[0] ?? null;
      }
    }

    if (!voiceId) {
      throw new Error(`Invalid ElevenLabs sharing link: "${input.sharingLink}"`);
    }

    if (publicUserId) {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/voices/add/${publicUserId}/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ new_name: `shared-${voiceId}` }),
      });

      if (!res.ok && res.status !== 400) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          `Failed to import shared ElevenLabs voice (${res.status}): ${JSON.stringify(err)}`,
        );
      }

      if (res.ok) {
        const data = (await res.json()) as { voice_id: string };
        return data.voice_id;
      }
    }

    return voiceId;
  }

  async revoke(modelRef: string): Promise<void> {
    if (!this.config.apiKey) return;
    const voiceId = modelRef
      .replace(/^elevenlabs-voice:/, "")
      .replace(/^elevenlabs-pvc:/, "")
      .trim();
    if (!voiceId) return;

    await this.fetchImpl(`${this.baseUrl}/v1/voices/${voiceId}`, {
      method: "DELETE",
      headers: {
        "xi-api-key": this.config.apiKey,
      },
    }).catch(() => {
      // Ignore errors on delete if already removed
    });
  }
}
