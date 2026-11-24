import { describe, expect, it } from "vitest";
import { PwaEngagementChannel } from "@bardcast/engagement";
import { createApp } from "./app.js";
import { isApiPath } from "./worker.js";
import { InMemoryStore } from "./adapters/in-memory-store.js";
import { InMemoryAudioStorage, chapterAudioKey } from "./adapters/r2-audio-storage.js";
import { StubDecisionModel } from "./adapters/stub-decision-model.js";
import { StubIdentityProvider } from "./adapters/stub-identity-provider.js";
import { StubNarrativeWriter } from "./adapters/stub-narrative-writer.js";
import type { AntiphonyGateway } from "./ports/antiphony-gateway.js";
import type { AudioRenderer } from "./ports/audio-renderer.js";
import type { CoreServices } from "./ports/index.js";
import type { VoiceCloner } from "./ports/voice-cloner.js";
import { writeSheetVersion } from "./use-cases/sheets.js";
import { takeSeat } from "./use-cases/seats.js";

type AntiphonyReply = Awaited<ReturnType<AntiphonyGateway["listReplies"]>>[number];

const T = "2026-11-24T00:00:00Z";

function createTestHarness() {
  const store = new InMemoryStore();
  const audioStorage = new InMemoryAudioStorage();
  const repliesByPrompt = new Map<string, AntiphonyReply[]>();
  const playbackByUri = new Map<string, string>();
  const ivcCalls: Array<{ characterId: string; sampleAudioUrls: string[] }> = [];
  const revokedRefs: string[] = [];
  const renderedInputs: Array<{ voices: Record<string, string>; narratorVoiceRef?: string | undefined }> = [];

  const antiphony: AntiphonyGateway = {
    async ensureSpace() {},
    async createPrompt(input) {
      const id = `p-${repliesByPrompt.size + 1}`;
      const uri = `at://did:web:bardcast.test/space/game.bardcast.space.campaign/camp/did:plc:dm/dev.antiphony.audio.post/${id}`;
      repliesByPrompt.set(uri, []);
      return { uri, cid: `bafy${id}`, postId: id, title: input.title, createdAt: T };
    },
    async listReplies(promptUri) {
      return repliesByPrompt.get(promptUri) ?? [];
    },
    async playbackUrl(uri) {
      return playbackByUri.get(uri);
    },
    async createReply(input) {
      const list = repliesByPrompt.get(input.promptUri) ?? [];
      const id = `r-${list.length + 1}`;
      const uri = `at://did:web:bardcast.test/space/game.bardcast.space.campaign/camp/${input.actingDid}/dev.antiphony.audio.post/${id}`;
      list.push({
        uri,
        cid: `bafy${id}`,
        promptUri: input.promptUri,
        author: input.actingDid,
        authorDid: input.actingDid,
        ...(input.text !== undefined ? { transcript: input.text } : {}),
        audioUrl: `https://antiphony.test/audio/${id}.webm`,
        createdAt: T,
      });
      repliesByPrompt.set(input.promptUri, list);
      playbackByUri.set(uri, `https://antiphony.test/signed/${id}.webm`);
      return uri;
    },
  };

  const voice: VoiceCloner = {
    async createIvc(input) {
      ivcCalls.push(input);
      return `el-ivc-${ivcCalls.length}`;
    },
    async linkSharedPvc(input) {
      return `el-pvc-${input.sharingLink.split("/").pop() ?? "linked"}`;
    },
    async revoke(modelRef) {
      revokedRefs.push(modelRef);
    },
  };

  const audio: AudioRenderer = {
    async render(input) {
      renderedInputs.push({ voices: input.voices, narratorVoiceRef: input.narratorVoiceRef });
      const key =
        input.campaignId && input.chapterId
          ? chapterAudioKey(input.campaignId, input.chapterId)
          : "chapters/test.mp3";
      const audioRef = await audioStorage.storeAudio(key, new Uint8Array([1, 2, 3, 4]), "audio/mpeg");
      return { audioRef, durationSeconds: 12 };
    },
    async renderLine() {
      return { audio: new Blob([new Uint8Array([9, 9])], { type: "audio/mpeg" }), durationSeconds: 2 };
    },
  };

  const svc: CoreServices = {
    store,
    antiphony,
    narrative: new StubNarrativeWriter(),
    voice,
    audio,
    audioStorage,
    identity: new StubIdentityProvider(),
    decisions: new StubDecisionModel(),
    engagement: new PwaEngagementChannel({
      apiBaseUrl: "https://bardcast.test",
      sendPush: async () => {},
      promptUrl: (p) => `https://bardcast.test/play/${p}`,
    }),
    clock: () => new Date(T),
  };

  return { svc, app: createApp(svc), repliesByPrompt, playbackByUri, ivcCalls, revokedRefs, renderedInputs };
}

describe("playtest loop: voice lifecycle, multi-player sync, R2 audio, and worker paths", () => {
  it("routes /xrpc/* as an API path in the Worker", () => {
    expect(isApiPath("/healthz")).toBe(true);
    expect(isApiPath("/api/voice")).toBe(true);
    expect(isApiPath("/atproto/session")).toBe(true);
    expect(isApiPath("/xrpc/com.atproto.managedspace.checkAccess")).toBe(true);
    expect(isApiPath("/campaigns")).toBe(false);
    expect(isApiPath("/dm/")).toBe(false);
  });

  it("manages DID-keyed voice consent, session-zero IVC training, PVC linking, and revocation", async () => {
    const { svc, app, playbackByUri, ivcCalls, revokedRefs } = createTestHarness();
    const alice = { "X-Acting-Did": "did:plc:alice", "content-type": "application/json" };

    // Unauthenticated rejected
    expect((await app.request("/api/voice")).status).toBe(401);

    // Before consent, linking PVC or training IVC returns 409
    expect((await app.request("/api/voice/pvc", { method: "POST", headers: alice, body: JSON.stringify({ sharingLink: "https://elevenlabs.io/app/share/u/v1" }) })).status).toBe(409);
    expect((await app.request("/api/voice/ivc", { method: "POST", headers: alice })).status).toBe(409);

    // Grant consent
    const consentRes = await app.request("/api/voice/consent", { method: "POST", headers: alice });
    expect(consentRes.status).toBe(200);
    expect(await consentRes.json()).toMatchObject({ profile: { consent: true, status: "unlinked" } });

    // Without audio recordings yet, /api/voice/ivc returns trained: false instead of erroring
    const noSamples = await app.request("/api/voice/ivc", { method: "POST", headers: alice });
    expect(noSamples.status).toBe(200);
    expect(await noSamples.json()).toMatchObject({ trained: false, sampleCount: 0 });
    expect(ivcCalls).toHaveLength(0);

    // Seed a creation turn with a spoken reply URI so /api/voice/ivc trains from Session Zero
    const replyUri = "at://did:web:bardcast.test/space/game.bardcast.space.player/alice/did:plc:alice/dev.antiphony.audio.post/r0";
    playbackByUri.set(replyUri, "https://antiphony.test/signed/r0.webm");
    await svc.store.putCreation("creation.1", {
      player: "did:plc:alice",
      status: "confirmed",
      turns: [
        {
          kind: "opener",
          question: "Who are you when nobody's watching?",
          prompt: {
            uri: "at://did:web:bardcast.test/space/game.bardcast.space.player/alice/did:web:bardcast.test/dev.antiphony.audio.post/q0",
            cid: "bafyq0",
          },
          askedAt: T,
          reply: { uri: replyUri, transcript: "I keep the watch fires lit.", at: T },
        },
      ],
      settled: {},
      name: { confirmed: "Wren" },
      createdAt: T,
      updatedAt: T,
    });

    const trainedRes = await app.request("/api/voice/ivc", { method: "POST", headers: alice });
    expect(trainedRes.status).toBe(200);
    expect(await trainedRes.json()).toMatchObject({
      trained: true,
      sampleCount: 1,
      profile: { consent: true, status: "ivc", modelRef: "el-ivc-1" },
    });

    // Linking a PVC replaces and revokes the previous IVC
    const pvcRes = await app.request("/api/voice/pvc", {
      method: "POST",
      headers: alice,
      body: JSON.stringify({ sharingLink: "https://elevenlabs.io/app/share/user1/pvc99" }),
    });
    expect(pvcRes.status).toBe(200);
    expect(await pvcRes.json()).toMatchObject({
      profile: { consent: true, status: "pvc", modelRef: "el-pvc-pvc99" },
    });
    expect(revokedRefs).toEqual(["el-ivc-1"]);

    // Revoking deletes the provider voice and clears consent
    const revokeRes = await app.request("/api/voice", { method: "DELETE", headers: alice });
    expect(revokeRes.status).toBe(200);
    expect(await revokeRes.json()).toMatchObject({ profile: { consent: false, status: "unlinked" } });
    expect(revokedRefs).toEqual(["el-ivc-1", "el-pvc-pvc99"]);
  });

  it("isolates multi-player replies, avoids duplicate IVCs, syncs transcripts, and streams R2 chapter audio", async () => {
    const { svc, app, repliesByPrompt, ivcCalls, renderedInputs } = createTestHarness();
    const dm = { "X-Acting-Did": "did:plc:dm", "content-type": "application/json" };
    const alice = { "X-Acting-Did": "did:plc:alice", "content-type": "application/json" };
    const bob = { "X-Acting-Did": "did:plc:bob", "content-type": "application/json" };

    // DM creates campaign & links a narrator PVC
    const campRes = await app.request("/api/campaigns", {
      method: "POST",
      headers: dm,
      body: JSON.stringify({ title: "Thornwood Playtest" }),
    });
    const { id: campaignId } = (await campRes.json()) as { id: string };
    await app.request("/api/voice/consent", { method: "POST", headers: dm });
    await app.request("/api/voice/pvc", {
      method: "POST",
      headers: dm,
      body: JSON.stringify({ sharingLink: "https://elevenlabs.io/app/share/dm/narrator7" }),
    });

    // Seed two player-owned characters and seat them at the table
    for (const [charId, did, name] of [
      ["char.wren", "did:plc:alice", "Wren"],
      ["char.bram", "did:plc:bob", "Bram"],
    ] as const) {
      await svc.store.putCharacter(charId, { player: did, displayName: name, drives: [], createdAt: T });
      await writeSheetVersion(svc, charId, {
        character: `at://${did}/game.bardcast.character.profile/${charId}`,
        class: "fighter",
        abilities: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 13, charisma: 10 },
        features: [],
        advancements: [],
        traits: [],
        quirks: [],
        equipment: [],
        createdAt: T,
      });
      await takeSeat(svc, { campaignId, did, characterId: charId });
    }

    // Alice grants voice consent (keyed by DID, not charId)
    await app.request("/api/voice/consent", { method: "POST", headers: alice });

    // DM publishes a whole-party prompt
    const promptRes = await app.request(`/api/campaigns/${campaignId}/prompts`, {
      method: "POST",
      headers: dm,
      body: JSON.stringify({ title: "What do you do when the lantern goes out?", intent: "story" }),
    });
    const prompt = (await promptRes.json()) as { antiphonyPromptUri: string };

    // Alice cannot reply as Bob's character
    const spoofed = await app.request(`/api/campaigns/${campaignId}/characters/char.bram/reply`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({
        promptUri: prompt.antiphonyPromptUri,
        audioBase64: Buffer.from("fake").toString("base64"),
      }),
    });
    expect(spoofed.status).toBe(403);

    // Alice and Bob both reply (initially without transcript, simulating async Antiphony STT)
    expect(
      (
        await app.request(`/api/campaigns/${campaignId}/characters/char.wren/reply`, {
          method: "POST",
          headers: alice,
          body: JSON.stringify({
            promptUri: prompt.antiphonyPromptUri,
            audioBase64: Buffer.from("alice-audio").toString("base64"),
            intent: "story",
          }),
        })
      ).status,
    ).toBe(201);

    expect(
      (
        await app.request(`/api/campaigns/${campaignId}/characters/char.bram/reply`, {
          method: "POST",
          headers: bob,
          body: JSON.stringify({
            promptUri: prompt.antiphonyPromptUri,
            audioBase64: Buffer.from("bob-audio").toString("base64"),
            intent: "story",
          }),
        })
      ).status,
    ).toBe(201);

    // Alice's IVC was created ONCE from her reply; Bob had no consent so none created for him
    expect(ivcCalls).toHaveLength(1);
    expect(ivcCalls[0]?.characterId).toBe("did:plc:alice");

    // Antiphony finishes transcribing asynchronously
    const storedReplies = repliesByPrompt.get(prompt.antiphonyPromptUri)!;
    storedReplies[0]!.transcript = "I strike flint and hold the doorway.";
    storedReplies[1]!.transcript = "I slip into the rafters and watch.";

    // DM runs /sync to ingest finished transcripts
    const syncRes = await app.request(`/api/campaigns/${campaignId}/sync`, { method: "POST", headers: dm });
    expect(syncRes.status).toBe(200);
    expect(await syncRes.json()).toEqual({ promptsChecked: 1, charactersSynced: 2 });

    // Repeat sync must NOT leak another IVC slot for Alice
    expect(ivcCalls).toHaveLength(1);

    // Multi-player isolation: Alice only has Alice's exemplar, Bob only has Bob's
    expect((await svc.store.getBehavior("char.wren"))?.exemplars).toEqual(["I strike flint and hold the doorway."]);
    expect((await svc.store.getBehavior("char.bram"))?.exemplars).toEqual(["I slip into the rafters and watch."]);

    // Readiness resolves Alice's DID-keyed voice profile for char.wren (with playtest thresholds)
    const readinessRes = await app.request(
      `/api/campaigns/${campaignId}/readiness?character=char.wren&minTraits=0&minExemplars=1&requireVoice=true`,
    );
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { ready: boolean; perCharacter: Record<string, { voice: { ready: boolean } }> };
    expect(readiness.ready).toBe(true);
    expect(readiness.perCharacter["char.wren"]?.voice.ready).toBe(true);

    // DM generates chapter with playtest thresholds; audio stores to R2 and passes Alice's + DM's voice refs
    const genRes = await app.request(`/api/campaigns/${campaignId}/chapters`, {
      method: "POST",
      headers: dm,
      body: JSON.stringify({
        characterIds: ["char.wren"],
        thresholds: { minConfidentTraits: 0, minTraitConfidence: 60, minBehaviorExemplars: 1, requireVoice: true },
      }),
    });
    expect(genRes.status).toBe(201);
    const { chapter } = (await genRes.json()) as { chapter: { audioRef: string; status: string } };
    expect(chapter.status).toBe("ready");
    expect(chapter.audioRef).toMatch(/^\/api\/campaigns\/.+\/chapters\/.+\/audio$/);
    expect(renderedInputs).toHaveLength(1);
    expect(renderedInputs[0]).toEqual({
      voices: { "char.wren": "el-ivc-1" },
      narratorVoiceRef: "el-pvc-narrator7",
    });

    // Party member (Alice) can stream the R2 audio; an outsider gets 403
    const audioRes = await app.request(chapter.audioRef, { headers: alice });
    expect(audioRes.status).toBe(200);
    expect(audioRes.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await audioRes.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));

    const outsiderRes = await app.request(chapter.audioRef, { headers: { "X-Acting-Did": "did:plc:outsider" } });
    expect(outsiderRes.status).toBe(403);
  });
});
