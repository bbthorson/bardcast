import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { InMemoryStore } from "./adapters/in-memory-store.js";
import { StubDecisionModel } from "./adapters/stub-decision-model.js";
import { StubIdentityProvider } from "./adapters/stub-identity-provider.js";
import { StubNarrativeWriter } from "./adapters/stub-narrative-writer.js";
import { StubVoiceCloner } from "./adapters/stub-voice-cloner.js";
import { StubAudioRenderer } from "./adapters/stub-audio-renderer.js";
import { PwaEngagementChannel } from "@bardcast/engagement";
import type { CoreServices } from "./ports/index.js";
import type { AntiphonyGateway } from "./ports/antiphony-gateway.js";
import { writeSheetVersion } from "./use-cases/sheets.js";

type ReplyInput = Parameters<AntiphonyGateway["createReply"]>[0];

function fakeGateway(replies: ReplyInput[] = []): AntiphonyGateway {
  return {
    async ensureSpace() {},
    async createPrompt(input) {
      return {
        uri: "at://dev.antiphony.audio.post/p1",
        cid: "bafyp1",
        postId: "p1",
        title: input.title,
        createdAt: new Date().toISOString(),
      };
    },
    async listReplies() {
      return [];
    },
    async playbackUrl() {
      return undefined;
    },
    async createReply(input) {
      replies.push(input);
      return "at://dev.antiphony.audio.post/r1";
    },
  };
}

function mockServices(replies: ReplyInput[] = []): CoreServices {
  return {
    store: new InMemoryStore(),
    antiphony: fakeGateway(replies),
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity: new StubIdentityProvider(),
    decisions: new StubDecisionModel(),
    engagement: new PwaEngagementChannel({
      apiBaseUrl: "http://test",
      sendPush: async () => {},
      promptUrl: (p) => `http://test/${p}`,
    }),
    clock: () => new Date("2026-01-01T00:00:00Z"),
  };
}

describe("Orchestrator HTTP App", () => {
  it("responds to /healthz", async () => {
    const svc = mockServices();
    const app = createApp(svc);

    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("handles the complete campaign lifecycle: create -> invite -> join", async () => {
    const svc = mockServices();
    const app = createApp(svc);

    // 1. Unauthenticated create fails
    const unauth = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Quest for the Sunken Relic" }),
    });
    expect(unauth.status).toBe(401);

    // 2. DM creates campaign with authenticated DID
    const dmDid = "did:example:dm-sarah";
    const createRes = await app.request("/api/campaigns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Acting-Did": dmDid,
      },
      body: JSON.stringify({
        title: "Quest for the Sunken Relic",
        premise: "An underwater sunken city adventure.",
      }),
    });
    expect(createRes.status).toBe(201);
    const { id: campaignId, campaign } = (await createRes.json()) as {
      id: string;
      campaign: { dm: string; title: string };
    };
    expect(campaign.dm).toBe(dmDid);
    expect(campaign.title).toBe("Quest for the Sunken Relic");

    // 3. DM generates an invite code
    const inviteRes = await app.request(`/api/campaigns/${campaignId}/invites`, {
      method: "POST",
      headers: { "X-Acting-Did": dmDid },
    });
    expect(inviteRes.status).toBe(201);
    const { code } = (await inviteRes.json()) as { code: string };
    expect(code).toBeTruthy();

    // 4. Player joins using the invite code
    const playerDid = "did:example:player-bob";
    const joinRes = await app.request("/api/campaigns/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Acting-Did": playerDid,
      },
      body: JSON.stringify({ code }),
    });
    expect(joinRes.status).toBe(200);
    const joined = (await joinRes.json()) as { campaign: { party: string[] } };
    expect(joined.campaign.party).toContain(`at://${playerDid}`);

    // 5. Player lists campaigns and finds it
    const listRes = await app.request("/api/campaigns", {
      headers: { "X-Acting-Did": playerDid },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { campaigns: Array<{ id: string }> };
    expect(list.campaigns.some((c) => c.id === campaignId)).toBe(true);

    // 6. Non-existent invite returns 404
    const badJoin = await app.request("/api/campaigns/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Acting-Did": playerDid,
      },
      body: JSON.stringify({ code: "NONEXISTENT" }),
    });
    expect(badJoin.status).toBe(404);
  });

  it("validates request bodies and gates chapter generation by readiness", async () => {
    const replies: ReplyInput[] = [];
    const svc = mockServices(replies);
    const app = createApp(svc);

    const dmDid = "did:example:dm";
    const createRes = await app.request("/api/campaigns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Acting-Did": dmDid,
      },
      body: JSON.stringify({ title: "Frozen Pass" }),
    });
    const { id: campaignId } = (await createRes.json()) as { id: string };

    // Seed a character in the store
    await svc.store.putCharacter("char.sam", {
      displayName: "Sam",
      drives: ["Protect the valley"],
      createdAt: "2026-01-01T00:00:00Z",
    });

    // Invalid prompt body
    const badPrompt = await app.request(`/api/campaigns/${campaignId}/prompts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }), // title min 1
    });
    expect(badPrompt.status).toBe(400);

    // Valid prompt
    const promptRes = await app.request(`/api/campaigns/${campaignId}/prompts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Acting-Did": dmDid,
      },
      body: JSON.stringify({
        title: "What do you see in the blizzard?",
        scene: "Wind howls across the ridge.",
      }),
    });
    expect(promptRes.status).toBe(201);

    // Generate chapter when not ready returns 409
    const chapterRes = await app.request(`/api/campaigns/${campaignId}/chapters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ characterIds: ["char.sam"] }),
    });
    expect(chapterRes.status).toBe(409);
    const err = (await chapterRes.json()) as { error: string };
    expect(err.error).toBe("not_ready");

    // Player uploads reply
    const replyRes = await app.request(`/api/campaigns/${campaignId}/characters/char.sam/reply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Acting-Did": "did:example:player-sam",
      },
      body: JSON.stringify({
        promptUri: "at://dev.antiphony.audio.post/p1",
        audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
        intent: "voice",
      }),
    });
    expect(replyRes.status).toBe(201);
    const replyBody = (await replyRes.json()) as { success: boolean; replyUri: string };
    expect(replyBody.success).toBe(true);
    expect(replyBody.replyUri).toBe("at://dev.antiphony.audio.post/r1");
    // The reply names the CID stored when the prompt was published.
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ promptUri: "at://dev.antiphony.audio.post/p1", promptCid: "bafyp1" });

    // A reply to a prompt this campaign never published has no CID to name: 404, nothing sent.
    const strayRes = await app.request(`/api/campaigns/${campaignId}/characters/char.sam/reply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Acting-Did": "did:example:player-sam",
      },
      body: JSON.stringify({
        promptUri: "at://dev.antiphony.audio.post/unknown",
        audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
      }),
    });
    expect(strayRes.status).toBe(404);
    expect(replies).toHaveLength(1);
  });

  it("runs session zero for the signed-in player only", async () => {
    const app = createApp(mockServices());
    const alice = { "X-Acting-Did": "did:plc:alice", "content-type": "application/json" };

    expect((await app.request("/api/creations", { method: "POST" })).status).toBe(401);

    const started = await app.request("/api/creations", { method: "POST", headers: alice });
    expect(started.status).toBe(201);
    const { id, creation } = (await started.json()) as { id: string; creation: { turns: Array<{ kind: string }> } };
    expect(creation.turns[0]!.kind).toBe("opener");

    const answered = await app.request(`/api/creations/${id}/answer`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({ text: "Nobody you'd notice." }),
    });
    expect(answered.status).toBe(200);
    const after = (await answered.json()) as { creation: { turns: Array<{ kind: string; reply?: unknown }> } };
    expect(after.creation.turns.map((t) => t.kind)).toEqual(["opener", "name"]);

    const mallory = { "X-Acting-Did": "did:plc:mallory" };
    expect((await app.request(`/api/creations/${id}`, { headers: mallory })).status).toBe(403);
    expect((await app.request(`/api/creations/${id}/propose`, { method: "POST", headers: alice })).status).toBe(409);
    const badPick = await app.request(`/api/creations/${id}/pick`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({ attribute: "class", value: "astronaut" }),
    });
    expect(badPick.status).toBe(400);

    const list = (await (await app.request("/api/creations", { headers: alice })).json()) as { creations: unknown[] };
    expect(list.creations).toHaveLength(1);
  });

  it("previews an invite, then seats the character the player brings", async () => {
    const svc = mockServices();
    const app = createApp(svc);
    const T = "2026-10-28T00:00:00Z";
    await svc.store.putCampaign("campaign.thornwood", {
      title: "Thornwood",
      dm: "did:plc:dm",
      party: [],
      startingLevel: 1,
      characterGuidance: "Bring someone with a debt.",
      createdAt: T,
    });
    await svc.store.createInvite("ABC123", "campaign.thornwood", "did:plc:dm");
    await svc.store.putCharacter("char.wren", { player: "did:plc:alice", displayName: "Wren", drives: [], createdAt: T });
    await writeSheetVersion(svc, "char.wren", {
      character: "at://did:plc:alice/game.bardcast.character.profile/wren",
      class: "paladin",
      abilities: { strength: 15, dexterity: 10, constitution: 14, intelligence: 8, wisdom: 12, charisma: 13 },
      features: [],
      advancements: [],
      traits: [],
      quirks: [],
      equipment: [],
      createdAt: T,
    });
    const alice = { "X-Acting-Did": "did:plc:alice", "content-type": "application/json" };

    const preview = await app.request("/api/invites/abc123", { headers: alice });
    expect(await preview.json()).toEqual({
      campaignId: "campaign.thornwood",
      title: "Thornwood",
      startingLevel: 1,
      characterGuidance: "Bring someone with a debt.",
    });

    const joined = await app.request("/api/campaigns/join", {
      method: "POST",
      headers: alice,
      body: JSON.stringify({ code: "ABC123", characterId: "char.wren" }),
    });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toMatchObject({ campaignId: "campaign.thornwood", characterId: "char.wren" });

    const detail = (await (await app.request("/api/campaigns/campaign.thornwood")).json()) as { party: unknown[] };
    expect(detail.party).toMatchObject([{ player: "did:plc:alice", id: "char.wren", profile: { displayName: "Wren" } }]);

    const mallory = { "X-Acting-Did": "did:plc:mallory", "content-type": "application/json" };
    const stolen = await app.request("/api/campaigns/join", {
      method: "POST",
      headers: mallory,
      body: JSON.stringify({ code: "ABC123", characterId: "char.wren" }),
    });
    expect(stolen.status).toBe(403);
  });
});
