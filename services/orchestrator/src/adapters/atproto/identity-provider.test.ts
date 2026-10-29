import { OAuthClient } from "@atproto/oauth-client";
import { d1Store } from "@bbthorson/atproto-cf-auth/server";
import { PwaEngagementChannel } from "@bardcast/engagement";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { CoreServices } from "../../ports/index.js";
import { sqliteD1 } from "../d1/sqlite-d1.js";
import { InMemoryStore } from "../in-memory-store.js";
import { StubAudioRenderer } from "../stub-audio-renderer.js";
import { StubDecisionModel } from "../stub-decision-model.js";
import { StubNarrativeWriter } from "../stub-narrative-writer.js";
import { StubVoiceCloner } from "../stub-voice-cloner.js";
import { AtprotoDohHandleResolver } from "@atproto-labs/handle-resolver";
import { AtprotoIdentityProvider, edgeFetch } from "./identity-provider.js";

const ORIGIN = "https://bardcast.example";

function servicesWithRealSignIn(): CoreServices {
  return {
    store: new InMemoryStore(),
    antiphony: {
      ensureSpace: async () => {},
      playbackUrl: async () => undefined,
      createPrompt: async () => {
        throw new Error("unused");
      },
      listReplies: async () => [],
      createReply: async () => "at://unused",
    },
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity: new AtprotoIdentityProvider({
      appName: "Bardcast",
      store: d1Store(sqliteD1()),
      secret: "test-secret-that-is-at-least-32-characters",
    }),
    decisions: new StubDecisionModel(),
    engagement: new PwaEngagementChannel({
      apiBaseUrl: "http://test",
      sendPush: async () => {},
      promptUrl: (p) => `http://test/${p}`,
    }),
    clock: () => new Date("2026-01-01T00:00:00Z"),
  };
}

/** Stands in for the player's PDS so the flow runs offline. */
function fakePds(did = "did:plc:alice") {
  let state: string | undefined;
  vi.spyOn(OAuthClient.prototype, "authorize").mockImplementation(async (_handle, opts) => {
    state = opts?.state ?? undefined;
    return new URL("https://pds.example/oauth/authorize");
  });
  vi.spyOn(OAuthClient.prototype, "callback").mockImplementation(async () => ({
    session: { did, signOut: async () => undefined } as never,
    state: state ?? null,
  }));
  vi.spyOn(OAuthClient.prototype, "identityResolver", "get").mockReturnValue({
    resolve: async () => ({ did, handle: "alice.bsky.social", pds: new URL("https://pds.example") }),
  } as never);
}

function cookieFrom(res: Response, name: string): string {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return line!.split(";")[0]!;
}

afterEach(() => vi.restoreAllMocks());

describe("AT-Proto sign-in on the HTTP app", () => {
  it("ignores X-Acting-Did once real sign-in is on", async () => {
    const app = createApp(servicesWithRealSignIn());
    const res = await app.request(`${ORIGIN}/api/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Acting-Did": "did:plc:someone-else" },
      body: JSON.stringify({ title: "Not yours" }),
    });
    expect(res.status).toBe(401);
  });

  it("signs a player in at /atproto and lets them create a campaign", async () => {
    fakePds();
    const app = createApp(servicesWithRealSignIn());

    const login = await app.request(`${ORIGIN}/atproto/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ handle: "alice.bsky.social" }),
    });
    expect(await login.json()).toEqual({ url: "https://pds.example/oauth/authorize" });

    const callback = await app.request(`${ORIGIN}/atproto/callback?code=c&state=s&iss=x`, {
      headers: { cookie: cookieFrom(login, "bsky_auth_nonce") },
    });
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("/");
    const cookie = cookieFrom(callback, "bsky_sid");

    const session = await app.request(`${ORIGIN}/atproto/session`, { headers: { cookie } });
    expect(await session.json()).toMatchObject({
      authenticated: true,
      user: { did: "did:plc:alice", handle: "alice.bsky.social" },
    });

    const create = await app.request(`${ORIGIN}/api/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Alice's table" }),
    });
    expect(create.status).toBe(201);
    expect(((await create.json()) as { campaign: { dm: string } }).campaign.dm).toBe("did:plc:alice");
  });

  it("publishes client metadata for the public origin", async () => {
    const app = createApp(servicesWithRealSignIn());
    const meta = (await (await app.request(`${ORIGIN}/atproto/client-metadata.json`)).json()) as Record<string, unknown>;
    expect(meta["client_id"]).toBe(`${ORIGIN}/atproto/client-metadata.json`);
    expect(meta["redirect_uris"]).toEqual([`${ORIGIN}/atproto/callback`]);
  });
});

/** Behaves like fetch on Workers: `redirect: "error"` is refused before any request. */
function workersFetch(routes: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (init?.redirect === "error") {
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    }
    const url = new URL(String(input));
    const route = routes[url.origin + url.pathname];
    if (!route) throw new TypeError(`unexpected fetch ${url}`);
    return route();
  });
}

describe("handle resolution on Workers", () => {
  const ALICE = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
  const resolver = () =>
    new AtprotoDohHandleResolver({ dohEndpoint: "https://cloudflare-dns.com/dns-query", fetch: edgeFetch });
  const noTxtRecord = () => Response.json({ Status: 0, Answer: [] }, { headers: { "content-type": "application/dns-json" } });

  it("resolves a bsky.social handle through its well-known DID", async () => {
    workersFetch({
      "https://cloudflare-dns.com/dns-query": noTxtRecord,
      "https://alice.bsky.social/.well-known/atproto-did": () => new Response(`${ALICE}\n`),
    });
    expect(await resolver().resolve("alice.bsky.social")).toBe(ALICE);
  });

  it("still treats a redirected well-known lookup as unresolved", async () => {
    workersFetch({
      "https://cloudflare-dns.com/dns-query": noTxtRecord,
      "https://alice.bsky.social/.well-known/atproto-did": () =>
        new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }),
    });
    expect(await resolver().resolve("alice.bsky.social")).toBeNull();
  });
});
