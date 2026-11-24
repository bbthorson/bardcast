/**
 * Binary audio storage port for rendered chapters.
 *
 * Production uses Cloudflare R2 (`R2AudioStorage`), keeping large MP3 buffers
 * out of D1 JSON rows. Tests and local Node dev can use `InMemoryAudioStorage`
 * or omit it (ElevenLabs falls back to a data URI).
 */

export interface StoredAudioObject {
  body: ArrayBuffer | Uint8Array | ReadableStream;
  contentType: string;
}

export interface AudioStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredAudioObject | null>;
  /** Build the public/API path that serves `key` back to an authenticated party member. */
  urlFor(key: string): string;
}
