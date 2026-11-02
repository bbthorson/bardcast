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
import { AtprotoIdentityProvider } from "./identity-provider.js";
import { BARDCAST_CONDITIONAL_SCOPES, BARDCAST_SCOPE } from "./scopes.js";

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


describe("what sign-in asks for", () => {
  const provider = (over: Partial<ConstructorParameters<typeof AtprotoIdentityProvider>[0]> = {}) =>
    new AtprotoIdentityProvider({
      appName: "Bardcast",
      store: d1Store(sqliteD1()),
      secret: "test-secret-that-is-at-least-32-characters",
      origin: ORIGIN,
      ...over,
    });

  it("publishes the character's repo scopes and the group scopes", () => {
    const scope = String(provider().auth.clientMetadata(ORIGIN).scope).split(" ");
    expect(scope).toEqual(
      expect.arrayContaining([
        "atproto",
        "repo:game.bardcast.character.profile",
        "repo:game.bardcast.character.sheet",
        "repo:game.bardcast.voice.profile",
        "rpc:fyi.opensocial.provisionGroup?aud=*",
        "rpc:fyi.opensocial.requestJoin?aud=*",
      ]),
    );
    // No space scope under the placeholder root: no PDS could resolve its lexicon.
    expect(scope.some((s) => s.startsWith("space:game.bardcast"))).toBe(false);
  });

  it("asks for the group scopes only from a PDS that serves spaces", async () => {
    // Whether a PDS serves spaces is the package's check (and its tests');
    // here it's stubbed, to see Bardcast asks for the group scopes on its say.
    const when = vi.spyOn(BARDCAST_CONDITIONAL_SCOPES[0]!, "when");
    const authorize = vi.spyOn(OAuthClient.prototype, "authorize").mockResolvedValue(new URL("https://pds.example/oauth"));
    // `oauthResolver` is an instance field of a class the package doesn't
    // export, so its prototype is reached through a throwaway client.
    const resolverProto = Object.getPrototypeOf(
      new OAuthClient({
        responseMode: "query",
        clientMetadata: {
          client_id: `${ORIGIN}/atproto/client-metadata.json`,
          redirect_uris: [`${ORIGIN}/atproto/callback`],
          scope: "atproto",
          token_endpoint_auth_method: "none",
          dpop_bound_access_tokens: true,
        },
        stateStore: { get: async () => undefined, set: async () => undefined, del: async () => undefined },
        sessionStore: { get: async () => undefined, set: async () => undefined, del: async () => undefined },
        runtimeImplementation: { createKey: async () => undefined as never, getRandomValues: () => new Uint8Array(), digest: async () => new Uint8Array() },
        handleResolver: "https://resolver.invalid",
      }).oauthResolver,
    );
    vi.spyOn(resolverProto, "resolveFromIdentity").mockResolvedValue({
      identityInfo: { did: "did:plc:alice", handle: "alice.test" },
      metadata: { issuer: "https://pds.example" },
      pds: new URL("https://pds.example"),
    } as never);
    const login = () =>
      createApp({ ...servicesWithRealSignIn(), identity: provider() }).request(`${ORIGIN}/atproto/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ handle: "alice.test" }),
      });

    when.mockResolvedValueOnce(false);
    await login();
    expect(String(authorize.mock.calls[0]![1]?.scope)).toBe(BARDCAST_SCOPE);

    when.mockResolvedValueOnce(true);
    await login();
    expect(String(authorize.mock.calls[1]![1]?.scope)).toContain("rpc:fyi.opensocial.provisionGroup?aud=*");
    expect(when).toHaveBeenCalledWith(expect.objectContaining({ pds: new URL("https://pds.example") }));
  });

  it("is a confidential client when given a key, and serves its public half", async () => {
    const { JoseKey } = await import("@atproto/jwk-jose");
    const key = JSON.stringify((await JoseKey.generate(["ES256"], "k1")).privateJwk);
    const auth = provider({ privateKeys: [key] }).auth;
    expect(auth.clientMetadata(ORIGIN).token_endpoint_auth_method).toBe("private_key_jwt");
    const jwks = (await (await auth.handle(new Request(`${ORIGIN}/atproto/jwks.json`)))!.json()) as { keys: object[] };
    expect(jwks.keys[0]).not.toHaveProperty("d");
  });

  it("restores a session by DID outside a request, with no session stored yet", async () => {
    expect(await provider().auth.restore("did:plc:alice")).toBeNull();
  });
});
