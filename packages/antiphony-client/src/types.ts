import { BlobRefSchema, EMBED_NSID } from "@antiphony/shared";
import { httpsUrl } from "@antiphony/shared/types/url";
import { z } from "zod";

/**
 * Wire shapes for the slice of the Antiphony (`dev.antiphony.*`) Core API that
 * Bardcast uses: creating spaces, uploading audio, creating posts (a post with
 * no `reply` is a prompt, a post with one is a reply), and reading a prompt's
 * replies. Mirrors apps/core-api/openapi.json (contract 0.8.0) in the antiphony
 * repo. The space shapes are declared here rather than imported, until
 * `@antiphony/shared` 0.9.0 (which exports them) is published.
 *
 * The canonical codecs (`BlobRefSchema`, the NSID constants) come from
 * `@antiphony/shared`; the request/response envelopes below are Bardcast's view
 * of the endpoints it actually calls.
 */

/** Every Antiphony JSON response wraps its payload in this envelope. */
export const ApiFailure = z.object({
  success: z.literal(false),
  error: z.object({ message: z.string(), code: z.string().optional(), issues: z.unknown().nullable().optional() }),
  requestId: z.string().optional(),
});
export type ApiFailure = z.infer<typeof ApiFailure>;

/** AT-Proto blob reference (`{ $type, ref: { $link: cid }, mimeType, size }`). */
export const BlobRef = BlobRefSchema;
export type BlobRef = z.infer<typeof BlobRefSchema>;

// --- Spaces (antiphony specs/spaces.md) --------------------------------------

/** One of the tenant's spaces, by type (an NSID) and key (record-key syntax; a DID is valid). */
export const SpaceKey = z.object({
  type: z.string().regex(/^[a-zA-Z][a-zA-Z0-9.-]*\.[a-zA-Z][a-zA-Z0-9]*$/, "Must be an NSID"),
  skey: z.string().min(1).max(512).regex(/^[A-Za-z0-9._:~-]+$/, "Must be a record key"),
});
export type SpaceKey = z.infer<typeof SpaceKey>;

/** Who may read, and who may write, a space. */
export const SpacePolicy = z.enum(["public", "member-list", "managing-app"]);
export type SpacePolicy = z.infer<typeof SpacePolicy>;

/** `PUT /api/v1/spaces/{type}/{skey}` result (inside `data`). */
export const SpaceView = SpaceKey.extend({
  uri: z.string(),
  readPolicy: SpacePolicy,
  writePolicy: SpacePolicy,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SpaceView = z.infer<typeof SpaceView>;

/**
 * The space a post lives in, read off its at:// uri
 * (`at://{appDid}/space/{type}/{skey}/{author}/{collection}/{rkey}`), or null
 * for a flat post. A reply goes in its parent's space, so this is how a reply
 * knows where its audio must be uploaded.
 */
export function spaceOfUri(uri: string): SpaceKey | null {
  const parts = uri.replace(/^at:\/\//, "").split("/");
  if (parts[1] !== "space" || parts.length < 7) return null;
  const parsed = SpaceKey.safeParse({ type: parts[2], skey: parts[3] });
  return parsed.success ? parsed.data : null;
}

/**
 * `POST /api/v1/audio/upload` result (inside `data`). `space` is where the blob
 * actually lives: the first upload of the same bytes decides it, so it can
 * differ from the space the upload named.
 */
export const UploadAudioResult = z.object({ blob: BlobRef, space: SpaceKey.optional() });

/** `dev.antiphony.embed.audio` — the audio attachment referenced on a post. */
export const AudioEmbed = z.object({
  $type: z.literal(EMBED_NSID.Audio),
  audio: BlobRef,
  durationMs: z.number().int().optional(),
  alt: z.string().optional(),
  waveform: z.array(z.number()).optional(),
});
export type AudioEmbed = z.infer<typeof AudioEmbed>;

/** A content-addressed pointer to another record (`com.atproto.repo.strongRef`). */
export const StrongRef = z.object({ uri: z.string(), cid: z.string() });
export type StrongRef = z.infer<typeof StrongRef>;

/** Threading pointers — presence on a post makes it a reply, not a prompt. */
export const ReplyRef = z.object({ root: StrongRef, parent: StrongRef });
export type ReplyRef = z.infer<typeof ReplyRef>;

/** `POST /api/v1/posts` request body. `originAppId`/`authorId`/`kind` are stamped server-side. */
export const CreatePostRequest = z.object({
  text: z.string().max(3000).default(""),
  title: z.string().max(3000).optional(),
  embed: AudioEmbed.optional(),
  reply: ReplyRef.optional(),
  langs: z.array(z.string()).optional(),
  /** Place a prompt in a space. A reply inherits its parent's and must not name another. */
  space: SpaceKey.optional(),
});
export type CreatePostRequest = z.infer<typeof CreatePostRequest>;

/** `POST /api/v1/posts` result (inside `data`). */
export const CreatePostResult = z.object({ postId: z.string() });

/**
 * The hydrated audio embed on a read view: a playback URL + transcript. For a
 * flat post the URL is stable and unsigned. For a post in a space it is signed
 * and expires within the hour (Antiphony 0.8.0), so use it right away and
 * re-read the post for a fresh one: never store it.
 */
export const AudioEmbedView = z.object({
  url: httpsUrl().optional(),
  durationMs: z.number().int().optional(),
  transcript: z.object({ text: z.string().optional() }).optional(),
});

/** `dev.antiphony.audio.post#view` — a hydrated post as returned by reads. */
export const AudioPostView = z.object({
  uri: z.string(),
  cid: z.string(),
  kind: z.enum(["prompt", "reply"]),
  authorId: z.string(),
  authorDid: z.string().optional(),
  record: z.looseObject({ text: z.string().optional(), title: z.string().optional(), createdAt: z.string().optional() }),
  embed: AudioEmbedView.optional(),
});
export type AudioPostView = z.infer<typeof AudioPostView>;

/** `GET /api/v1/posts/{postId}/replies` result (inside `data`). */
export const RepliesPage = z.object({ items: z.array(AudioPostView), nextCursor: z.string().optional() });

// --- Normalized views the gateway hands to the loop --------------------------

/** A prompt (a post with no reply), as the loop consumes it. */
export interface AntiphonyPrompt {
  /** at:// uri (authority is the Antiphony app DID). */
  uri: string;
  cid: string;
  /** Storage id (rkey) — the id the replies endpoint is keyed on; = last uri segment. */
  postId: string;
  title?: string;
  audioUrl?: string;
  createdAt: string;
}

/** A reply (a post whose `reply.root` is the prompt), as the loop consumes it. */
export interface AntiphonyReply {
  uri: string;
  cid: string;
  /** at:// uri of the prompt this answers. */
  promptUri: string;
  /** The authoring player: Antiphony's authorId (Bardcast asserts the DID). */
  author: string;
  authorDid?: string;
  audioUrl?: string;
  transcript?: string;
  createdAt: string;
}

export interface ListRepliesQuery {
  /** at:// uri OR storage postId of the prompt. */
  prompt: string;
  cursor?: string;
  limit?: number;
}
