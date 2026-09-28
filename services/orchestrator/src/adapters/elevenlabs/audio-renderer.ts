import type { AudioRenderer, RenderChapterInput, RenderedAudio } from "../../ports/audio-renderer.js";

export interface AudioStorageAdapter {
  storeAudio(key: string, buffer: Uint8Array, contentType: string): Promise<string>;
}

export interface ElevenLabsAudioRendererConfig {
  apiKey: string;
  baseUrl?: string;
  defaultNarratorVoiceId?: string;
  modelId?: string;
  storage?: AudioStorageAdapter;
  fetchImpl?: typeof fetch;
}

/**
 * Production AudioRenderer adapter for ElevenLabs.
 *
 * Implements:
 * 1. Multi-voice dialogue synthesis across player cloned voices and DM narration.
 * 2. Audio frame stitching to create seamless chapter MP3s.
 * 3. Persistence to Cloudflare R2 / S3 storage (or in-memory data URI fallback).
 */
export class ElevenLabsAudioRenderer implements AudioRenderer {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultNarratorVoiceId: string;
  private readonly modelId: string;

  constructor(private readonly config: ElevenLabsAudioRendererConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.elevenlabs.io").replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    // Default narrator voice: Rachel (calm, clear fantasy storytelling)
    this.defaultNarratorVoiceId = config.defaultNarratorVoiceId ?? "21m00Tcm4TlvDq8ikWAM";
    this.modelId = config.modelId ?? "eleven_multilingual_v2";
  }

  async render(input: RenderChapterInput): Promise<RenderedAudio> {
    if (!this.config.apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured.");
    }

    // Determine dialogue lines to synthesize
    const lines =
      input.script && input.script.length > 0
        ? input.script
        : [{ speaker: "narrator", text: input.transcript }];

    const audioBuffers: Uint8Array[] = [];
    let totalEstimatedDuration = 0;

    for (const line of lines) {
      const cleanText = line.text.trim();
      if (!cleanText) continue;

      // Select voice
      const voiceId =
        input.voices[line.speaker] ??
        (line.speaker === "narrator" ? input.narratorVoiceRef : undefined) ??
        this.defaultNarratorVoiceId;

      const res = await this.fetchImpl(`${this.baseUrl}/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          `ElevenLabs TTS failed for speaker "${line.speaker}" (${res.status}): ${JSON.stringify(err)}`,
        );
      }

      const chunkBuffer = new Uint8Array(await res.arrayBuffer());
      audioBuffers.push(chunkBuffer);
      totalEstimatedDuration += Math.max(1, Math.round(cleanText.length / 15));
    }

    // Concatenate audio buffers (for MPEG audio/mp3, concatenating frames is valid)
    const totalLength = audioBuffers.reduce((acc, b) => acc + b.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const b of audioBuffers) {
      combined.set(b, offset);
      offset += b.length;
    }

    // Store audio and produce audioRef
    let audioRef: string;
    if (this.config.storage) {
      const key = `chapters/chapter-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.mp3`;
      audioRef = await this.config.storage.storeAudio(key, combined, "audio/mpeg");
    } else {
      // In-memory / data URI fallback when no external S3/R2 storage is mounted
      const base64 = Buffer.from(combined).toString("base64");
      audioRef = `data:audio/mpeg;base64,${base64}`;
    }

    return {
      audioRef,
      durationSeconds: totalEstimatedDuration,
    };
  }
}
