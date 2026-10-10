import { AntiphonyClient, AntiphonyError } from "@bardcast/antiphony-client";
import { describe, expect, it } from "vitest";
import { ClientAntiphonyGateway } from "./antiphony-gateway.js";

/**
 * Integration test: drive the Antiphony client + gateway against a mock Core API
 * that implements the real v0.2.0 wire contract (openapi.json), asserting the
 * routes, response envelope, service-token auth, and — the load-bearing bit —
 * that a write carries the acting player's DID so Antiphony can stamp authorDid.
 */

const TOKEN = "test-service-token";
const APP_DID = "did:web:bardcast.app";

interface Captured {
  path: string;
  method: string;
  headers: Record<string, string | undefined>;
  body: string;
  /** Text fields of a multipart body. */
  form?: Record<string, string>;
}

const baseUrl = "http://mock-antiphony";
const captured: Captured[] = [];
/** Set to make the mock answer that the uploaded bytes already live in this space. */
let uploadedElsewhere: { type: string; skey: string } | undefined;
const SPACE = { type: "game.bardcast.space.campaign", skey: "campaign.thornwood" };

function ok(data: unknown) {
  return JSON.stringify({ success: true, data });
}

async function mockFetch(input: string | URL | { toString(): string }, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input));
  const path = url.pathname;
  const method = init.method ?? "GET";

  const rawHeaders: Record<string, string | undefined> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        rawHeaders[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const item of init.headers) {
        const k = item[0];
        const v = item[1];
        if (k) rawHeaders[k.toLowerCase()] = v;
      }
    } else {
      for (const [k, v] of Object.entries(init.headers)) rawHeaders[k.toLowerCase()] = String(v);
    }
  }

  let bodyStr = "";
  let form: Record<string, string> | undefined;
  if (init.body instanceof FormData) {
    rawHeaders["content-type"] = "multipart/form-data; boundary=---mockboundary";
    bodyStr = "[FormData]";
    form = {};
    for (const [k, v] of init.body.entries()) if (typeof v === "string") form[k] = v;
  } else if (typeof init.body === "string") {
    bodyStr = init.body;
  }

  captured.push({
    path,
    method,
    headers: rawHeaders,
    body: bodyStr,
    ...(form ? { form } : {}),
  });

  const spaceMatch = /^\/api\/v1\/spaces\/([^/]+)\/([^/]+)$/.exec(path);
  if (spaceMatch && method === "PUT") {
    const type = decodeURIComponent(spaceMatch[1]!);
    const skey = decodeURIComponent(spaceMatch[2]!);
    const policies = JSON.parse(bodyStr) as { readPolicy: string; writePolicy: string };
    return new Response(
      ok({ uri: `at://${APP_DID}/space/${type}/${skey}`, type, skey, ...policies, createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } else if (path === "/api/v1/audio/upload" && method === "POST") {
    // Where the blob "already lives", for the first-upload-wins case.
    const stored = uploadedElsewhere ?? (form?.spaceType ? { type: form.spaceType, skey: form.skey } : undefined);
    return new Response(
      ok({
        blob: { $type: "blob", ref: { $link: "bafyaudiocid" }, mimeType: "audio/webm", size: 123 },
        ...(stored ? { space: stored } : {}),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } else if (path === "/api/v1/posts" && method === "POST") {
    return new Response(ok({ postId: "p1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } else if (path === "/api/v1/posts/p1" && method === "GET") {
    return new Response(
      ok({
        uri: `at://${APP_DID}/dev.antiphony.audio.post/p1`,
        cid: "bafypostcid",
        kind: "prompt",
        authorId: "did:example:dm",
        authorDid: "did:example:dm",
        record: {
          title: "A scar you carry",
          text: "Firelight catches an old mark.",
          createdAt: "2026-07-01T00:00:00Z",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } else if (path === "/api/v1/posts/p1/replies" && method === "GET") {
    return new Response(
      ok({
        items: [
          {
            uri: `at://${APP_DID}/dev.antiphony.audio.post/r1`,
            cid: "bafyreply",
            kind: "reply",
            authorId: "did:example:alice",
            authorDid: "did:example:alice",
            record: { createdAt: "2026-07-02T00:00:00Z" },
            embed: { url: "https://cdn.example/r1.webm", transcript: { text: "It was the wolf." } },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ success: false, error: { message: "not found" }, requestId: "x" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

function gateway() {
  return new ClientAntiphonyGateway(
    new AntiphonyClient({ baseUrl, getServiceToken: () => TOKEN, fetch: mockFetch as any }),
  );
}

describe("Antiphony gateway", () => {
  it("creates a prompt tied to the DM's DID and reads it back", async () => {
    captured.length = 0;
    const prompt = await gateway().createPrompt({
      title: "A scar you carry",
      scene: "Firelight catches an old mark.",
      actingDid: "did:example:dm",
      space: SPACE,
    });

    // Normalized prompt view.
    expect(prompt.uri).toBe(`at://${APP_DID}/dev.antiphony.audio.post/p1`);
    expect(prompt.cid).toBe("bafypostcid");
    expect(prompt.postId).toBe("p1");
    expect(prompt.title).toBe("A scar you carry");

    const create = captured.find((c) => c.path === "/api/v1/posts" && c.method === "POST")!;
    // Service-token auth + the DM asserted as the acting actor (→ authorDid).
    expect(create.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(create.headers["x-antiphony-acting-actor"]).toBe("did:example:dm");
    expect(create.headers["x-antiphony-acting-actor-did"]).toBe("did:example:dm");
    const body = JSON.parse(create.body) as { title: string; text: string; reply?: unknown };
    expect(body.title).toBe("A scar you carry");
    expect(body.text).toBe("Firelight catches an old mark.");
    expect(body.reply).toBeUndefined(); // no reply ⇒ it's a prompt
    expect((body as { space?: unknown }).space).toEqual(SPACE); // in the campaign's space
  });

  it("puts the space first, as Bardcast's own, and only once per space", async () => {
    captured.length = 0;
    const gw = gateway();
    await gw.createPrompt({ title: "One", actingDid: "did:example:dm", space: SPACE });
    await gw.createPrompt({ title: "Two", actingDid: "did:example:dm", space: SPACE });

    const puts = captured.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe("/api/v1/spaces/game.bardcast.space.campaign/campaign.thornwood");
    expect(JSON.parse(puts[0]!.body)).toEqual({ readPolicy: "managing-app", writePolicy: "managing-app" });
    // Service token only: the space isn't any one player's.
    expect(puts[0]!.headers["x-antiphony-acting-actor"]).toBeUndefined();
    expect(captured.findIndex((c) => c.method === "PUT")).toBeLessThan(captured.findIndex((c) => c.path === "/api/v1/posts"));
  });

  it("puts a player's own space under their DID", async () => {
    captured.length = 0;
    await gateway().ensureSpace({ type: "game.bardcast.space.player", skey: "did:plc:alice" });
    expect(captured[0]!.path).toBe(`/api/v1/spaces/game.bardcast.space.player/${encodeURIComponent("did:plc:alice")}`);
  });

  it("uploads a reply's audio into its prompt's space", async () => {
    captured.length = 0;
    const client = new AntiphonyClient({ baseUrl, getServiceToken: () => TOKEN, fetch: mockFetch as any });
    const prompt = {
      uri: `at://${APP_DID}/space/${SPACE.type}/${SPACE.skey}/did:example:dm/dev.antiphony.audio.post/p1`,
      cid: "bafypostcid",
    };
    await client.createReply({ prompt, audio: { blob: new Blob([new Uint8Array([1])], { type: "audio/webm" }) } }, "did:example:alice");

    expect(captured.find((c) => c.path === "/api/v1/audio/upload")!.form).toEqual({ spaceType: SPACE.type, skey: SPACE.skey });
    // The reply names no space: it inherits its parent's.
    const body = JSON.parse(captured.find((c) => c.path === "/api/v1/posts")!.body) as { space?: unknown };
    expect(body.space).toBeUndefined();
  });

  it("refuses audio that already lives somewhere else, before posting it", async () => {
    captured.length = 0;
    uploadedElsewhere = { type: SPACE.type, skey: "campaign.other" };
    try {
      const err = await gateway()
        .createReply({
          promptUri: `at://${APP_DID}/space/${SPACE.type}/${SPACE.skey}/did:example:dm/dev.antiphony.audio.post/p1`,
          audioBlob: new Blob([new Uint8Array([1])]),
          actingDid: "did:example:alice",
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AntiphonyError);
      expect((err as AntiphonyError).code).toBe("AUDIO_PLACEMENT");
      expect(captured.some((c) => c.path === "/api/v1/posts")).toBe(false);
    } finally {
      uploadedElsewhere = undefined;
    }
  });

  it("lists replies, mapping the signed audio URL and transcript", async () => {
    captured.length = 0;
    const replies = await gateway().listReplies(`at://${APP_DID}/dev.antiphony.audio.post/p1`);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      author: "did:example:alice",
      authorDid: "did:example:alice",
      audioUrl: "https://cdn.example/r1.webm",
      transcript: "It was the wolf.",
    });
    // Derived the postId (rkey) from the at:// uri and hit the replies route.
    const list = captured.find((c) => c.path === "/api/v1/posts/p1/replies")!;
    expect(list.method).toBe("GET");
    expect(list.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("posts a player reply via multipart upload + a reply ref to the prompt", async () => {
    captured.length = 0;
    const client = new AntiphonyClient({ baseUrl, getServiceToken: () => TOKEN, fetch: mockFetch as any });
    const prompt = { uri: `at://${APP_DID}/dev.antiphony.audio.post/p1` as const, cid: "bafypostcid" };
    await client.createReply(
      { prompt, audio: { blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }) } },
      "did:example:alice",
    );

    const upload = captured.find((c) => c.path === "/api/v1/audio/upload")!;
    expect(upload.headers["content-type"]).toMatch(/^multipart\/form-data/);
    expect(upload.headers["x-antiphony-acting-actor-did"]).toBe("did:example:alice");

    const post = captured.find((c) => c.path === "/api/v1/posts")!;
    const body = JSON.parse(post.body) as {
      reply?: { root: { uri: string }; parent: { uri: string } };
      embed?: { audio: { ref: { $link: string } } };
    };
    expect(body.reply?.root.uri).toBe(prompt.uri); // reply ⇒ threaded to the prompt
    expect(body.embed?.audio.ref.$link).toBe("bafyaudiocid"); // AT-Proto {$link} blob shape
  });
});

describe("AntiphonyClient.listReplies (fetch-mocked)", () => {
  const PROMPT = "at://did:web:x/dev.antiphony.audio.post/pp";
  const reply = (id: string) => ({
    uri: `at://did:web:x/dev.antiphony.audio.post/${id}`,
    cid: `bafy${id}`,
    kind: "reply",
    authorId: "did:plc:alice",
    record: { createdAt: "2026-07-02T00:00:00Z" },
    embed: { url: `https://cdn.example/${id}.webm` },
  });

  it("pages through multiple reply pages and collects all items", async () => {
    const calls: string[] = [];
    const client = new AntiphonyClient({
      baseUrl: "https://api.example",
      getServiceToken: () => "t",
      fetch: (async (url: string | URL) => {
        const u = new URL(url.toString());
        calls.push(u.searchParams.get("cursor") ?? "first");
        const cursor = u.searchParams.get("cursor");
        if (!cursor) {
          return new Response(ok({ items: [reply("r1"), reply("r2")], nextCursor: "c2" }));
        }
        return new Response(ok({ items: [reply("r3")] }));
      }) as typeof fetch,
    });

    const items = await client.listReplies({ prompt: PROMPT });
    expect(items.map((i) => i.uri)).toEqual([
      "at://did:web:x/dev.antiphony.audio.post/r1",
      "at://did:web:x/dev.antiphony.audio.post/r2",
      "at://did:web:x/dev.antiphony.audio.post/r3",
    ]);
    expect(calls).toEqual(["first", "c2"]);
  });

  it("translates error responses to AntiphonyError", async () => {
    const client = new AntiphonyClient({
      baseUrl: "https://api.example",
      getServiceToken: () => "t",
      fetch: (async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "not_found", message: "post not found" },
            requestId: "req-xyz",
          }),
          { status: 404 },
        );
      }) as typeof fetch,
    });

    await expect(client.listReplies({ prompt: PROMPT })).rejects.toSatisfy((e) => {
      expect(e).toBeInstanceOf(AntiphonyError);
      const err = e as AntiphonyError;
      expect(err.status).toBe(404);
      expect(err.code).toBe("not_found");
      return true;
    });
  });
});
