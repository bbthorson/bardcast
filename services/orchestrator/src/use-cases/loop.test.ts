import type { CharacterProfile, Campaign } from "@bardcast/domain";
import { describe, expect, it } from "vitest";
import { StubAudioRenderer } from "../adapters/stub-audio-renderer.js";
import { StubIdentityProvider } from "../adapters/stub-identity-provider.js";
import { StubNarrativeWriter } from "../adapters/stub-narrative-writer.js";
import { StubVoiceCloner } from "../adapters/stub-voice-cloner.js";
import { InMemoryStore } from "../adapters/in-memory-store.js";
import { PwaEngagementChannel } from "@bardcast/engagement";
import type { CoreServices } from "../ports/index.js";
import type { AntiphonyGateway } from "../ports/antiphony-gateway.js";
import { checkReadiness } from "./check-readiness.js";
import { generateChapter, NotReadyError } from "./generate-chapter.js";
import { ingestReplies } from "./ingest-replies.js";

/** A fake gateway that returns canned replies — no network. */
function fakeGateway(transcripts: string[]): AntiphonyGateway {
  return {
    async createPrompt(input) {
      return { uri: "at://prompt/1", cid: "bafyprompt", postId: "1", title: input.title, createdAt: "2026-01-01T00:00:00Z" };
    },
    async listReplies(promptUri) {
      return transcripts.map((t, i) => ({
        uri: `at://reply/${i}`,
        cid: `bafyreply${i}`,
        promptUri,
        author: "did:example:alice",
        authorDid: "did:example:alice",
        transcript: t,
        audioUri: `http://audio/reply-${i}.mp3`,
        createdAt: "2026-01-01T00:00:00Z",
      }));
    },
  };
}

function services(gateway: AntiphonyGateway): CoreServices {
  return {
    store: new InMemoryStore(),
    antiphony: gateway,
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity: new StubIdentityProvider(),
    engagement: new PwaEngagementChannel({
      apiBaseUrl: "http://test",
      sendPush: async () => {},
      promptUrl: (r) => `http://test/play/${r}`,
    }),
    clock: () => new Date("2026-01-01T00:00:00Z"),
  };
}

const CHAR = "char.alice";

async function seedCharacter(svc: CoreServices) {
  const profile: CharacterProfile = { displayName: "Alice the Bold", createdAt: "2026-01-01T00:00:00Z" };
  await svc.store.putCharacter(CHAR, profile);
  const campaign: Campaign = {
    title: "Thornwood",
    dm: "did:example:dm",
    party: [`at://${CHAR}`],
    createdAt: "2026-01-01T00:00:00Z",
  };
  await svc.store.putCampaign("campaign.thornwood", campaign);
  // consent must exist before voice can train
  await svc.store.putVoice(CHAR, {
    status: "unlinked",
    consent: true,
    createdAt: "2026-01-01T00:00:00Z",
  });
}

describe("the Bardcast loop", () => {
  it("gates chapter generation until a character has enough signal", async () => {
    const svc = services(fakeGateway(["a", "b"]));
    await seedCharacter(svc);

    const before = await checkReadiness(svc, { characterIds: [CHAR] });
    expect(before.ready).toBe(false);

    await expect(
      generateChapter(svc, { campaignId: "campaign.thornwood", characterIds: [CHAR] }),
    ).rejects.toBeInstanceOf(NotReadyError);
  });

  it("becomes ready after enough replies are ingested, then generates a chapter", async () => {
    // 8 transcripts → clears behavior exemplars + (3+) voice samples.
    const svc = services(fakeGateway(Array.from({ length: 8 }, (_, i) => `decision ${i}`)));
    await seedCharacter(svc);
    // give the sheet enough confident traits directly (sheet inference is TODO).
    await svc.store.putSheet(CHAR, {
      traits: Array.from({ length: 5 }, (_, i) => ({ name: `t${i}`, confidence: 80 })),
      drives: [],
      sourceReplies: [],
      createdAt: "2026-01-01T00:00:00Z",
    });

    await ingestReplies(svc, { characterId: CHAR, voxPopPromptUri: "at://prompt/1", intent: "story" });

    const readiness = await checkReadiness(svc, { characterIds: [CHAR] });
    expect(readiness.ready).toBe(true);

    const { chapter, events } = await generateChapter(svc, {
      campaignId: "campaign.thornwood",
      characterIds: [CHAR],
    });
    expect(chapter.status).toBe("ready");
    expect(chapter.audioRef).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0]?.subject).toBe(`at://${CHAR}`);
  });
});
