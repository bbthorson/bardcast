import {
  CreatePromptInput,
  VoxPopPrompt,
  VoxPopReply,
  type ListRepliesQuery,
  type Paginated,
} from "./types.js";

export interface VoxPopClientOptions {
  /** Base URL of a vox-pop-core deployment, e.g. https://core.voxpop.example. */
  baseUrl: string;
  /**
   * Returns a bearer token for the current actor. vox-pop-core accepts a
   * Firebase ID token or a session cookie value (see core-api README). Bardcast
   * supplies whatever its IdentityProvider yields.
   */
  getToken: () => Promise<string> | string;
  /** Override for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export class VoxPopError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "VoxPopError";
  }
}

/**
 * Thin, typed wrapper over the vox-pop-core /api/v1/* surface. Bardcast reaches
 * vox-pop ONLY through this client, behind the VoxPopGateway port — so the rest
 * of the system never hard-codes the engine's wire format.
 *
 * Endpoints below are stubs that encode the request/response shapes; wire them
 * to the real routes once a deployment exists.
 */
export class VoxPopClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: VoxPopClientOptions) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  private async authHeader(): Promise<Record<string, string>> {
    const token = await this.opts.getToken();
    return { authorization: `Bearer ${token}` };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", ...(await this.authHeader()), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      throw new VoxPopError(`vox-pop ${path} failed`, res.status, await res.text().catch(() => undefined));
    }
    return (await res.json()) as T;
  }

  /** POST /api/v1/prompts — create an audio prompt the party will reply to. */
  async createPrompt(input: CreatePromptInput): Promise<VoxPopPrompt> {
    CreatePromptInput.parse(input);
    // TODO(bardcast): multipart upload for audioBlob via the uploads endpoint,
    // then create the prompt referencing the uploaded blob.
    const data = await this.request<unknown>("/api/v1/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: input.title, description: input.description, audioUrl: input.audioUrl }),
    });
    return VoxPopPrompt.parse(data);
  }

  /** GET /api/v1/prompts/:id — fetch a single prompt. */
  async getPrompt(uri: string): Promise<VoxPopPrompt> {
    const data = await this.request<unknown>(`/api/v1/prompts/${encodeURIComponent(uri)}`);
    return VoxPopPrompt.parse(data);
  }

  /** GET /api/v1/replies?promptUri=… — page through a prompt's audio replies. */
  async listReplies(query: ListRepliesQuery): Promise<Paginated<VoxPopReply>> {
    const params = new URLSearchParams({ promptUri: query.promptUri });
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit) params.set("limit", String(query.limit));
    const data = await this.request<{ items: unknown[]; cursor?: string }>(
      `/api/v1/replies?${params.toString()}`,
    );
    return {
      items: data.items.map((i) => VoxPopReply.parse(i)),
      ...(data.cursor ? { cursor: data.cursor } : {}),
    };
  }
}
