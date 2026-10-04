import { describe, expect, it } from "vitest";
import { PwaEngagementChannel } from "@bardcast/engagement";
import { createApp } from "../../app.js";
import type { CoreServices } from "../../ports/index.js";
import { InMemoryStore } from "../in-memory-store.js";
import { StubAudioRenderer } from "../stub-audio-renderer.js";
import { StubDecisionModel } from "../stub-decision-model.js";
import { StubNarrativeWriter } from "../stub-narrative-writer.js";
import { StubVoiceCloner } from "../stub-voice-cloner.js";
import { AtprotoIdentityProvider } from "./identity-provider.js";
import { InMemoryAppSessionStore } from "./stores.js";

function servicesWithRealSignIn(appSessions: InMemoryAppSessionStore): CoreServices {
  return {
    store: new InMemoryStore(),
    antiphony: {
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
      baseUrl: "https://bardcast.example",
      appName: "Bardcast",
      postLoginRedirect: "https://bardcast.example/",
      appSessionStore: appSessions,
      handleResolver: "https://public.api.bsky.app",
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

describe("AT-Proto sign-in on the HTTP app", () => {
  it("ignores X-Acting-Did once real sign-in is on", async () => {
    const app = createApp(servicesWithRealSignIn(new InMemoryAppSessionStore()));
    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Acting-Did": "did:plc:someone-else" },
      body: JSON.stringify({ title: "Not yours" }),
    });
    expect(res.status).toBe(401);
  });

  it("resolves the session cookie to the signed-in player", async () => {
    const appSessions = new InMemoryAppSessionStore();
    await appSessions.set("sid-1", { did: "did:plc:alice", createdAt: "2026-01-01T00:00:00Z" });
    const app = createApp(servicesWithRealSignIn(appSessions));

    const signedIn = await app.request("/atproto/session", { headers: { cookie: "bardcast_sid=sid-1" } });
    expect(await signedIn.json()).toMatchObject({ authenticated: true, player: { did: "did:plc:alice" } });

    const create = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "bardcast_sid=sid-1" },
      body: JSON.stringify({ title: "Alice's table" }),
    });
    expect(create.status).toBe(201);
  });

  it("rejects a callback that this browser did not start", async () => {
    const app = createApp(servicesWithRealSignIn(new InMemoryAppSessionStore()));
    const res = await app.request("/atproto/callback?code=c&state=s&iss=https%3A%2F%2Fbsky.social");
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("bardcast_sid=");
  });

  it("publishes client metadata for the public origin", async () => {
    const app = createApp(servicesWithRealSignIn(new InMemoryAppSessionStore()));
    const meta = (await (await app.request("/atproto/client-metadata.json")).json()) as Record<string, unknown>;
    expect(meta["client_id"]).toBe("https://bardcast.example/atproto/client-metadata.json");
    expect(meta["redirect_uris"]).toEqual(["https://bardcast.example/atproto/callback"]);
  });
});
