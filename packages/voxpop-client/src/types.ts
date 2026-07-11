import { EMBED_NSID } from "@antiphony/shared";
import { z } from "zod";

/**
 * Wire shapes for the slice of the Antiphony (`dev.antiphony.*`) Core API that
 * Bardcast uses: uploading audio, creating posts (a post with no `reply` is a
 * prompt, a post with one is a reply), and reading a prompt's replies. Mirrors
 * apps/core-api/openapi.json (contract v0.2.0) in the antiphony repo.
 *
 * These are defined here rather than imported from `@antiphony/shared` because
 * the published `@antiphony/shared@0.3.0` still types the blob `ref` as a plain
 * string, while the deployed engine uses the AT-Proto `{ $link }` object (see
 * the openapi + `@atproto/lex-json`). We DO import the NSID constants from the
 * package (those are current).
 * TODO(bardcast): once @antiphony/shared is republished to match the engine's
 * blob shape, drop these local mirrors and import its codecs directly.
 */

/** Every Antiphony JSON response wraps its payload in this envelope. */
export const ApiFailure = z.object({
  success: z.literal(false),
  error: z.object({ message: z.string(), code: z.string().optional(), issues: z.unknown().nullable().optional() }),
  requestId: z.string().optional(),
});
export type ApiFailure = z.infer<typeof ApiFailure>;

/** AT-Proto blob reference — `ref` is a `{ $link: cid }` object, not a string. */
export const BlobRef = z.object({
  $type: z.literal("blob"),
  ref: z.object({ $link: z.string().min(1) }),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});
export type BlobRef = z.infer<typeof BlobRef>;

/** `POST /api/v1/audio/upload` result (inside `data`). */
export const UploadAudioResult = z.object({ blob: BlobRef });

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
});
export type CreatePostRequest = z.infer<typeof CreatePostRequest>;

/** `POST /api/v1/posts` result (inside `data`). */
export const CreatePostResult = z.object({ postId: z.string() });

/** The hydrated audio embed on a read view: a signed playback URL + transcript. */
export const AudioEmbedView = z.object({
  url: z.string().optional(),
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
  record: z.object({ text: z.string().optional(), title: z.string().optional(), createdAt: z.string().optional() }).passthrough(),
  embed: AudioEmbedView.optional(),
});
export type AudioPostView = z.infer<typeof AudioPostView>;

/** `GET /api/v1/posts/{postId}/replies` result (inside `data`). */
export const RepliesPage = z.object({ items: z.array(AudioPostView), nextCursor: z.string().optional() });

// --- Normalized views the gateway hands to the loop --------------------------

/** A prompt (a post with no reply), as the loop consumes it. */
export interface VoxPopPrompt {
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
export interface VoxPopReply {
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
