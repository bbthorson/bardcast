import { NSID } from "@antiphony/shared";
import type { z } from "zod";
import {
  ApiFailure,
  AudioPostView,
  BlobRef,
  CreatePostResult,
  RepliesPage,
  UploadAudioResult,
  type CreatePostRequest,
  type ListRepliesQuery,
  type ReplyRef,
  type VoxPopPrompt,
  type VoxPopReply,
} from "./types.js";

export interface AntiphonyClientOptions {
  /** Base URL of an Antiphony Core API deployment, e.g. https://core.antiphony.example. */
  baseUrl: string;
  /**
   * The app service token. Antiphony is headless: the ONLY credential is a
   * per-app service token (`Authorization: Bearer <token>`), which establishes
   * Bardcast's tenancy (`originAppId`). End-user identity is asserted per
   * request via the acting-actor headers, not a user token.
   */
  getServiceToken: () => Promise<string> | string;
  /** Override for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
}

/** Headers Antiphony reads to attribute a write to one of the app's users. */
const ACTING_ACTOR = "x-antiphony-acting-actor";
const ACTING_ACTOR_DID = "x-antiphony-acting-actor-did";

export class AntiphonyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AntiphonyError";
  }
}

/** postId (rkey) is the last segment of a post's at:// uri (see the engine's postIdFromUri). */
export function postIdFromUri(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

/**
 * Typed client for the Antiphony Core API (`/api/v1/*`). Bardcast reaches the
 * engine ONLY through this client, behind the VoxPopGateway port — so the loop
 * never hard-codes the engine's wire format.
 *
 * "Tie a post to a player": every write asserts the acting player's DID via the
 * acting-actor headers; Antiphony stamps it onto the record's `authorDid`.
 */
export class AntiphonyClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: AntiphonyClientOptions) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  // --- transport ------------------------------------------------------------

  private async headers(actingDid?: string): Promise<Record<string, string>> {
    const h: Record<string, string> = { authorization: `Bearer ${await this.opts.getServiceToken()}` };
    // Bardcast asserts the player's DID as both the acting actor id and DID.
    if (actingDid) {
      h[ACTING_ACTOR] = actingDid;
      h[ACTING_ACTOR_DID] = actingDid;
    }
    return h;
  }

  /** Send a request and unwrap Antiphony's `{ success, data }` envelope. */
  private async send<T>(
    path: string,
    init: RequestInit,
    dataSchema: z.ZodType<T>,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", ...(init.headers ?? {}) },
    });
    // Read as text first: a non-JSON error (an HTML page from a proxy, a crash
    // dump) shouldn't collapse into a detail-less "failed" — keep the raw body.
    const text = await res.text().catch(() => "");
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const fail = ApiFailure.safeParse(json);
      throw new AntiphonyError(
        fail.success
          ? fail.data.error.message
          : `antiphony ${path} failed (${res.status}): ${text.slice(0, 200) || res.statusText}`,
        res.status,
        fail.success ? fail.data.error.code : undefined,
      );
    }
    const envelope = json as { data?: unknown };
    return dataSchema.parse(envelope?.data);
  }

  // --- low-level endpoints --------------------------------------------------

  /** `POST /api/v1/audio/upload` — multipart `file` field → a blob ref to embed. */
  async uploadAudio(audio: Blob, opts: { actingDid: string; filename?: string }): Promise<BlobRef> {
    const form = new FormData();
    form.append("file", audio, opts.filename ?? "reply.webm");
    const { blob } = await this.send(
      "/api/v1/audio/upload",
      { method: "POST", headers: await this.headers(opts.actingDid), body: form },
      UploadAudioResult,
    );
    return blob;
  }

  /** `POST /api/v1/posts` — create a post (prompt if no `reply`, else a reply). */
  async createPost(body: CreatePostRequest, opts: { actingDid: string }): Promise<string> {
    const { postId } = await this.send(
      "/api/v1/posts",
      {
        method: "POST",
        headers: { ...(await this.headers(opts.actingDid)), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      CreatePostResult,
    );
    return postId;
  }

  /** `GET /api/v1/posts/{postId}` — a hydrated post view (tenancy-scoped read). */
  async getPost(postId: string): Promise<z.infer<typeof AudioPostView>> {
    return this.send(`/api/v1/posts/${encodeURIComponent(postId)}`, { method: "GET", headers: await this.headers() }, AudioPostView);
  }

  // --- high-level, normalized surface (what the gateway uses) ---------------

  /**
   * Create a prompt: optionally upload the DM's audio first, then create a
   * post with no `reply`, attributed to `actingDid`. Reads the post back to
   * return its at:// uri/cid.
   */
  async createPrompt(
    input: { title: string; text?: string; audio?: { blob: Blob; filename?: string } },
    actingDid: string,
  ): Promise<VoxPopPrompt> {
    const embed = input.audio
      ? await this.uploadAudio(input.audio.blob, { actingDid, ...(input.audio.filename ? { filename: input.audio.filename } : {}) })
      : undefined;

    const body: CreatePostRequest = {
      text: input.text ?? "",
      title: input.title,
      ...(embed ? { embed: { $type: "dev.antiphony.embed.audio", audio: embed } } : {}),
    };
    const postId = await this.createPost(body, { actingDid });

    const view = await this.getPost(postId);
    return {
      uri: view.uri,
      cid: view.cid,
      postId: postIdFromUri(view.uri),
      ...(view.record.title ? { title: view.record.title } : {}),
      ...(view.embed?.url ? { audioUrl: view.embed.url } : {}),
      createdAt: view.record.createdAt ?? new Date().toISOString(),
    };
  }

  /**
   * Post a player's reply to a prompt: upload audio, then create a post whose
   * `reply.root`/`parent` point at the prompt, attributed to `actingDid`.
   */
  async createReply(
    input: { prompt: { uri: string; cid: string }; audio: { blob: Blob; filename?: string }; text?: string },
    actingDid: string,
  ): Promise<string> {
    const audioRef = await this.uploadAudio(input.audio.blob, {
      actingDid,
      ...(input.audio.filename ? { filename: input.audio.filename } : {}),
    });
    const reply: ReplyRef = { root: input.prompt, parent: input.prompt };
    return this.createPost(
      { text: input.text ?? "", embed: { $type: "dev.antiphony.embed.audio", audio: audioRef }, reply },
      { actingDid },
    );
  }

  /**
   * `GET /api/v1/posts/{postId}/replies` — all replies to a prompt, following
   * pagination. A tenancy-scoped read (service token only, no acting actor).
   */
  async listReplies(query: ListRepliesQuery): Promise<VoxPopReply[]> {
    const postId = postIdFromUri(query.prompt);
    const out: VoxPopReply[] = [];
    let cursor = query.cursor;
    for (let guard = 0; guard < 50; guard++) {
      const params = new URLSearchParams();
      if (query.limit !== undefined) {
        // `limit` is a total cap across pages: only ask for what's still needed.
        const remaining = query.limit - out.length;
        if (remaining <= 0) break;
        params.set("limit", String(remaining));
      }
      if (cursor) params.set("cursor", cursor);
      const qs = params.toString();
      const page = await this.send(
        `/api/v1/posts/${encodeURIComponent(postId)}/replies${qs ? `?${qs}` : ""}`,
        { method: "GET", headers: await this.headers() },
        RepliesPage,
      );
      for (const item of page.items) {
        out.push({
          uri: item.uri,
          cid: item.cid,
          promptUri: query.prompt,
          author: item.authorId,
          ...(item.authorDid ? { authorDid: item.authorDid } : {}),
          ...(item.embed?.url ? { audioUrl: item.embed.url } : {}),
          ...(item.embed?.transcript?.text ? { transcript: item.embed.transcript.text } : {}),
          createdAt: item.record.createdAt ?? new Date().toISOString(),
        });
      }
      if (query.limit !== undefined && out.length >= query.limit) break;
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    // A page may overshoot the remaining count; trim to the requested cap.
    if (query.limit !== undefined && out.length > query.limit) out.length = query.limit;
    return out;
  }

  /** The post collection NSID, exposed for callers that build refs. */
  static readonly POST_COLLECTION = NSID.AudioPost;
}
