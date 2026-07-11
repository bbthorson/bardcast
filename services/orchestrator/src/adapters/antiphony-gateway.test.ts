import { AntiphonyClient, AntiphonyError } from "@bardcast/antiphony-client";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  headers: IncomingMessage["headers"];
  body: string;
}

let server: Server;
let baseUrl: string;
const captured: Captured[] = [];

function ok(data: unknown) {
  return JSON.stringify({ success: true, data });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname;
      captured.push({
        path,
        method: req.method ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.setHeader("content-type", "application/json");

      if (path === "/api/v1/audio/upload" && req.method === "POST") {
        res.end(ok({ blob: { $type: "blob", ref: { $link: "bafyaudiocid" }, mimeType: "audio/webm", size: 123 } }));
      } else if (path === "/api/v1/posts" && req.method === "POST") {
        res.end(ok({ postId: "p1" }));
      } else if (path === "/api/v1/posts/p1" && req.method === "GET") {
        res.end(
          ok({
            uri: `at://${APP_DID}/dev.antiphony.audio.post/p1`,
            cid: "bafypostcid",
            kind: "prompt",
            authorId: "did:example:dm",
            authorDid: "did:example:dm",
            record: { title: "A scar you carry", text: "Firelight catches an old mark.", createdAt: "2026-07-01T00:00:00Z" },
          }),
        );
      } else if (path === "/api/v1/posts/p1/replies" && req.method === "GET") {
        res.end(
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
        );
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ success: false, error: { message: "not found" }, requestId: "x" }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

function gateway() {
  return new ClientAntiphonyGateway(new AntiphonyClient({ baseUrl, getServiceToken: () => TOKEN }));
}

describe("Antiphony gateway", () => {
  it("creates a prompt tied to the DM's DID and reads it back", async () => {
    captured.length = 0;
    const prompt = await gateway().createPrompt({
      title: "A scar you carry",
      scene: "Firelight catches an old mark.",
      actingDid: "did:example:dm",
    });

    // Normalized prompt view.
    expect(prompt.uri).toBe(`at://${APP_DID}/dev.antiphony.audio.post/p1`);
    expect(prompt.cid).toBe("bafypostcid");
    expect(prompt.postId).toBe("p1");
    expect(prompt.title).toBe("A scar you carry");

    const create = captured.find((c) => c.path === "/api/v1/posts" && c.method === "POST")!;
    // Service-token auth + the DM asserted as the acting actor (→ authorDid).
    expect(create.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(create.headers["x-antiphony-acting-actor"]).toBe("did:example:dm");
    expect(create.headers["x-antiphony-acting-actor-did"]).toBe("did:example:dm");
    const body = JSON.parse(create.body) as { title: string; text: string; reply?: unknown };
    expect(body.title).toBe("A scar you carry");
    expect(body.text).toBe("Firelight catches an old mark.");
    expect(body.reply).toBeUndefined(); // no reply ⇒ it's a prompt
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
    expect(list.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("posts a player reply via multipart upload + a reply ref to the prompt", async () => {
    captured.length = 0;
    const client = new AntiphonyClient({ baseUrl, getServiceToken: () => TOKEN });
    const prompt = { uri: `at://${APP_DID}/dev.antiphony.audio.post/p1`, cid: "bafypostcid" };
    await client.createReply(
      { prompt, audio: { blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }) } },
      "did:example:alice",
    );

    const upload = captured.find((c) => c.path === "/api/v1/audio/upload")!;
    expect(upload.headers["content-type"]).toMatch(/^multipart\/form-data/);
    expect(upload.headers["x-antiphony-acting-actor-did"]).toBe("did:example:alice");

    const post = captured.find((c) => c.path === "/api/v1/posts")!;
    const body = JSON.parse(post.body) as { reply?: { root: { uri: string }; parent: { uri: string } }; embed?: { audio: { ref: { $link: string } } } };
    expect(body.reply?.root.uri).toBe(prompt.uri); // reply ⇒ threaded to the prompt
    expect(body.embed?.audio.ref.$link).toBe("bafyaudiocid"); // AT-Proto {$link} blob shape
  });
});

describe("AntiphonyClient.listReplies (fetch-mocked)", () => {
  const PROMPT = "at://did:web:x/dev.antiphony.audio.post/pp";
  const reply = (id: string) => ({
    uri: `at://did:web:x/dev.antiphony.audio.post/${id}`,
    cid: `cid-${id}`,
    kind: "reply",
    authorId: "did:example:a",
    record: { createdAt: "2026-07-02T00:00:00Z" },
  });
  const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

  it("treats `limit` as a total cap and only requests what's still needed", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      urls.push(String(input));
      // Two pages of two replies each; a page always honors the requested limit.
      const u = new URL(String(input));
      const lim = Number(u.searchParams.get("limit") ?? "2");
      const cursor = u.searchParams.get("cursor");
      if (!cursor) return envelope({ items: [reply("r1"), reply("r2")].slice(0, lim), nextCursor: "c1" });
      return envelope({ items: [reply("r3"), reply("r4")].slice(0, lim) });
    }) as unknown as typeof fetch;

    const client = new AntiphonyClient({ baseUrl: "http://mock", getServiceToken: () => "tok", fetch: fetchImpl });
    const out = await client.listReplies({ prompt: PROMPT, limit: 3 });

    expect(out).toHaveLength(3); // capped, not the 4 available
    expect(urls[0]).toContain("limit=3"); // asks for the cap up front
    expect(urls[1]).toContain("limit=1"); // then only the remainder
  });

  it("preserves the status + body of a non-JSON error response", async () => {
    const fetchImpl = (async () =>
      new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const client = new AntiphonyClient({ baseUrl: "http://mock", getServiceToken: () => "tok", fetch: fetchImpl });

    await expect(client.listReplies({ prompt: PROMPT })).rejects.toMatchObject({
      constructor: AntiphonyError,
      status: 502,
    });
    await expect(client.listReplies({ prompt: PROMPT })).rejects.toThrow(/502.*Bad Gateway/s);
  });
});
