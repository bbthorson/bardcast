import { CharacterSheet, joinCampaign, type CharacterProfile, type Campaign } from "@bardcast/domain";
import { describe, expect, it } from "vitest";
import { StubAudioRenderer } from "../adapters/stub-audio-renderer.js";
import { StubDecisionModel } from "../adapters/stub-decision-model.js";
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
        audioUrl: `http://audio/reply-${i}.mp3`,
        createdAt: "2026-01-01T00:00:00Z",
      }));
    },
    async createReply() {
      return "at://dev.antiphony.audio.post/r-test";
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
    decisions: new StubDecisionModel(),
    engagement: new PwaEngagementChannel({
      apiBaseUrl: "http://test",
      sendPush: async () => {},
      promptUrl: (r) => `http://test/play/${r}`,
    }),
    clock: () => new Date("2026-01-01T00:00:00Z"),
  };
}

const CHAR = "char.alice";
const CAMPAIGN = "campaign.thornwood";

async function seedCharacter(svc: CoreServices) {
  const profile: CharacterProfile = { displayName: "Alice the Bold", drives: [], createdAt: "2026-01-01T00:00:00Z" };
  await svc.store.putCharacter(CHAR, profile);
  const campaign: Campaign = {
    title: "Thornwood",
    dm: "did:example:dm",
    party: [`at://${CHAR}`],
    createdAt: "2026-01-01T00:00:00Z",
  };
  await svc.store.putCampaign(CAMPAIGN, campaign);
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

    const before = await checkReadiness(svc, { campaignId: CAMPAIGN, characterIds: [CHAR] });
    expect(before.ready).toBe(false);

    await expect(
      generateChapter(svc, { campaignId: CAMPAIGN, characterIds: [CHAR] }),
    ).rejects.toBeInstanceOf(NotReadyError);
  });

  it("becomes ready after enough replies are ingested, then generates a chapter", async () => {
    // 8 transcripts → clears behavior exemplars + (3+) voice samples.
    const svc = services(fakeGateway(Array.from({ length: 8 }, (_, i) => `decision ${i}`)));
    await seedCharacter(svc);
    // give the sheet enough confident traits directly (the stub DecisionModel infers none).
    await svc.store.putSeat(CAMPAIGN, CHAR, {
      campaign: `at://${CAMPAIGN}`,
      character: `at://${CHAR}`,
      traits: Array.from({ length: 5 }, (_, i) => ({ name: `t${i}`, confidence: 80 })),
      sourceReplies: [],
      startingLevel: 1,
      advancements: [],
      createdAt: "2026-01-01T00:00:00Z",
    });

    await ingestReplies(svc, {
      campaignId: CAMPAIGN,
      characterId: CHAR,
      antiphonyPromptUri: "at://prompt/1",
      intent: "story",
    });

    const readiness = await checkReadiness(svc, { campaignId: CAMPAIGN, characterIds: [CHAR] });
    expect(readiness.ready).toBe(true);

    const { chapter, events } = await generateChapter(svc, {
      campaignId: CAMPAIGN,
      characterIds: [CHAR],
    });
    expect(chapter.status).toBe("ready");
    expect(chapter.audioRef).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0]?.subject).toBe(`at://${CHAR}`);
  });

  it("keeps a character's seat separate per campaign", async () => {
    const svc = services(fakeGateway([]));
    await seedCharacter(svc);
    const OTHER = "campaign.saltmarsh";
    const sheet = (campaign: string, ac: string) => ({
      campaign: `at://${campaign}`,
      character: `at://${CHAR}`,
      traits: [{ name: "armor class", value: ac, confidence: 90 }],
      sourceReplies: [],
      startingLevel: 1,
      advancements: [],
      createdAt: "2026-01-01T00:00:00Z",
    });
    await svc.store.putSeat(CAMPAIGN, CHAR, sheet(CAMPAIGN, "25"));
    await svc.store.putSeat(OTHER, CHAR, sheet(OTHER, "14"));

    expect((await svc.store.getSeat(CAMPAIGN, CHAR))?.traits[0]?.value).toBe("25");
    expect((await svc.store.getSeat(OTHER, CHAR))?.traits[0]?.value).toBe("14");
  });

  it("starts a fresh seat when a character joins a new campaign, and keeps who they are", async () => {
    const svc = services(fakeGateway(["I'll take the left passage.", "Steady now."]));
    await seedCharacter(svc);
    await svc.store.putSeat(CAMPAIGN, CHAR, {
      campaign: `at://${CAMPAIGN}`,
      character: `at://${CHAR}`,
      traits: [{ name: "armor class", value: "25", confidence: 90 }],
      sourceReplies: ["at://reply/thornwood-1"],
      startingLevel: 1,
      advancements: [],
      createdAt: "2026-01-01T00:00:00Z",
    });
    await ingestReplies(svc, { campaignId: CAMPAIGN, characterId: CHAR, antiphonyPromptUri: "at://prompt/1", intent: "behavior" });
    const behaviorBefore = await svc.store.getBehavior(CHAR);

    const OTHER = "campaign.saltmarsh";
    await ingestReplies(svc, { campaignId: OTHER, characterId: CHAR, antiphonyPromptUri: "at://prompt/2", intent: "sheet" });

    const fresh = await svc.store.getSeat(OTHER, CHAR);
    expect(fresh?.campaign).toBe(`at://${OTHER}`);
    expect(fresh?.character).toBe(`at://${CHAR}`);
    expect(fresh?.traits.find((t) => t.name === "armor class")).toBeUndefined();
    expect(fresh?.sourceReplies).not.toContain("at://reply/thornwood-1");
    // The old campaign's seat is untouched, and the durable behavior model carries over.
    expect((await svc.store.getSeat(CAMPAIGN, CHAR))?.traits[0]?.value).toBe("25");
    expect(behaviorBefore?.exemplars.length).toBeGreaterThan(0);
    expect(await svc.store.getBehavior(CHAR)).toEqual(behaviorBefore);
  });

  it("never writes the player's own sheet while they play", async () => {
    const svc = services(fakeGateway(["I'll take the left passage."]));
    await seedCharacter(svc);
    const sheet = CharacterSheet.parse({
      character: `at://${CHAR}`,
      class: "fighter",
      abilities: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 13, charisma: 10 },
      advancements: [2, 3, 4].map((level) => ({ level, hitPoints: 6, createdAt: "2026-01-01T00:00:00Z" })),
      createdAt: "2026-01-01T00:00:00Z",
    });
    await svc.store.putCharacterSheet(CHAR, sheet);
    const seat = joinCampaign({
      campaign: `at://${CAMPAIGN}`,
      sheet,
      sheetRef: { uri: `at://${CHAR}/sheet`, cid: "bafysheet" },
      startingLevel: 2,
      createdAt: "2026-01-01T00:00:00Z",
    });
    await svc.store.putSeat(CAMPAIGN, CHAR, seat);

    await ingestReplies(svc, { campaignId: CAMPAIGN, characterId: CHAR, antiphonyPromptUri: "at://prompt/1", intent: "story" });

    expect(await svc.store.getCharacterSheet(CHAR)).toEqual(sheet);
    const after = await svc.store.getSeat(CAMPAIGN, CHAR);
    expect(after?.brought?.advancements).toHaveLength(1); // reset to level 2
    expect(after?.sourceReplies).toContain("at://reply/0");
  });
});
