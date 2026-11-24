import type { AudioStorage, StoredAudioObject } from "../ports/audio-storage.js";
import type { AudioStorageAdapter } from "./elevenlabs/audio-renderer.js";

/**
 * The narrow slice of Cloudflare's R2Bucket binding this adapter needs.
 * Declared locally (like `D1Database` in `d1.ts`) so the orchestrator stays
 * free of `@cloudflare/workers-types` and tests can pass a small fake.
 */
export interface R2ObjectBody {
  readonly body: ReadableStream;
  readonly httpMetadata?: { contentType?: string | undefined } | undefined;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
}

const CHAPTER_KEY = /^chapters\/([^/]+)\/([^/]+)\.mp3$/;

/** Canonical R2 object key for a campaign chapter's rendered MP3. */
export function chapterAudioKey(campaignId: string, chapterId: string): string {
  return `chapters/${campaignId}/${chapterId}.mp3`;
}

/** Build the same-origin API path that streams a stored chapter MP3. */
export function audioUrlForKey(key: string): string {
  const match = CHAPTER_KEY.exec(key);
  if (match) {
    const [, campaignId, chapterId] = match;
    return `/api/campaigns/${encodeURIComponent(campaignId!)}/chapters/${encodeURIComponent(chapterId!)}/audio`;
  }
  return `/api/audio/${key}`;
}

/**
 * Cloudflare R2 backing for rendered chapter audio (`AUDIO_BUCKET` binding in
 * `wrangler.jsonc`). Implements both the `AudioStorage` port (for streaming)
 * and ElevenLabs' `AudioStorageAdapter` (for saving after TTS synthesis).
 */
export class R2AudioStorage implements AudioStorage, AudioStorageAdapter {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    await this.bucket.put(key, data, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<StoredAudioObject | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "audio/mpeg",
    };
  }

  urlFor(key: string): string {
    return audioUrlForKey(key);
  }

  async storeAudio(key: string, buffer: Uint8Array, contentType: string): Promise<string> {
    await this.put(key, buffer, contentType);
    return this.urlFor(key);
  }
}

/** In-memory `AudioStorage` for unit/HTTP tests. */
export class InMemoryAudioStorage implements AudioStorage, AudioStorageAdapter {
  private readonly objects = new Map<string, { data: Uint8Array; contentType: string }>();

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { data: new Uint8Array(data), contentType });
  }

  async get(key: string): Promise<StoredAudioObject | null> {
    const found = this.objects.get(key);
    if (!found) return null;
    return { body: found.data, contentType: found.contentType };
  }

  urlFor(key: string): string {
    return audioUrlForKey(key);
  }

  async storeAudio(key: string, buffer: Uint8Array, contentType: string): Promise<string> {
    await this.put(key, buffer, contentType);
    return this.urlFor(key);
  }
}
