import { CharacterSheet, type Campaign, type Creation } from "@bardcast/domain";
import { PwaEngagementChannel } from "@bardcast/engagement";
import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../adapters/in-memory-store.js";
import { StubAudioRenderer } from "../adapters/stub-audio-renderer.js";
import { StubDecisionModel } from "../adapters/stub-decision-model.js";
import { StubIdentityProvider } from "../adapters/stub-identity-provider.js";
import { StubNarrativeWriter } from "../adapters/stub-narrative-writer.js";
import { StubVoiceCloner } from "../adapters/stub-voice-cloner.js";
import type { CoreServices } from "../ports/index.js";
import { charactersOf, partyOf, takeSeat } from "./seats.js";
import { writeSheetVersion } from "./sheets.js";

const T = "2026-10-28T00:00:00Z";
const ALICE = "did:plc:alice" as const;
const BOB = "did:plc:bob" as const;
const TABLE = "campaign.thornwood";

function services(): CoreServices {
  return {
    store: new InMemoryStore(),
    antiphony: {
      ensureSpace: async () => {},
      createPrompt: async () => {
        throw new Error("unused");
      },
      listReplies: async () => [],
      playbackUrl: async () => undefined,
      createReply: async () => "at://unused",
    },
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity: new StubIdentityProvider(),
    decisions: new StubDecisionModel(),
    engagement: new PwaEngagementChannel({ apiBaseUrl: "http://test", sendPush: async () => {}, promptUrl: (r) => r }),
    clock: () => new Date(T),
  };
}

/** A character as session zero leaves one: a profile, a level-`level` sheet and a confirmed creation. */
async function made(svc: CoreServices, did: `did:${string}`, id: string, name: string, level = 1) {
  await svc.store.putCharacter(id, { player: did, displayName: name, drives: [], createdAt: T });
  await writeSheetVersion(
    svc,
    id,
    CharacterSheet.parse({
      character: `at://${did}/game.bardcast.character.profile/${id}`,
      class: "paladin",
      abilities: { strength: 17, dexterity: 10, constitution: 14, intelligence: 8, wisdom: 12, charisma: 15 },
      advancements: Array.from({ length: level - 1 }, (_, i) => ({ level: i + 2, hitPoints: 6, features: [], createdAt: T })),
      createdAt: T,
    }),
  );
  const creation: Creation = {
    player: did,
    status: "confirmed",
    turns: [],
    settled: {},
    name: { confirmed: name },
    character: id,
    createdAt: T,
    updatedAt: T,
  };
  await svc.store.putCreation(`creation.${id}`, creation);
}

async function table(svc: CoreServices, extra: Partial<Campaign> = {}) {
  await svc.store.putCampaign(TABLE, { title: "Thornwood", dm: "did:plc:dm", party: [], createdAt: T, ...extra });
}

describe("taking a seat", () => {
  it("branches a seat from the character's sheet, reset to the table's level", async () => {
    const svc = services();
    await made(svc, ALICE, "char.wren", "Wren", 5);
    await table(svc, { startingLevel: 3 });

    const { seat } = await takeSeat(svc, { campaignId: TABLE, did: ALICE, characterId: "char.wren" });

    expect(seat.startingLevel).toBe(3);
    expect(seat.brought?.advancements).toHaveLength(2); // level 3
    expect(seat.sheet?.uri).toMatch(/game\.bardcast\.character\.sheet/);
    expect((await svc.store.getCampaign(TABLE))!.party).toEqual([`at://${ALICE}`]);
    expect(await partyOf(svc, TABLE)).toMatchObject([{ player: ALICE, id: "char.wren", profile: { displayName: "Wren" } }]);
  });

  it("gives each player one seat per table", async () => {
    const svc = services();
    await made(svc, ALICE, "char.wren", "Wren");
    await made(svc, ALICE, "char.ash", "Ash");
    await table(svc);

    await takeSeat(svc, { campaignId: TABLE, did: ALICE, characterId: "char.wren" });
    // Bringing the same one again changes nothing.
    await takeSeat(svc, { campaignId: TABLE, did: ALICE, characterId: "char.wren" });
    expect((await svc.store.getCampaign(TABLE))!.party).toHaveLength(1);

    await expect(takeSeat(svc, { campaignId: TABLE, did: ALICE, characterId: "char.ash" })).rejects.toMatchObject({
      code: "conflict",
      message: "you're already at this table as Wren",
    });
  });

  it("only seats your own characters", async () => {
    const svc = services();
    await made(svc, ALICE, "char.wren", "Wren");
    await table(svc);
    await expect(takeSeat(svc, { campaignId: TABLE, did: BOB, characterId: "char.wren" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lists a player's characters that can take a seat", async () => {
    const svc = services();
    await made(svc, ALICE, "char.wren", "Wren", 2);
    await made(svc, BOB, "char.cadoc", "Cadoc");
    expect(await charactersOf(svc, ALICE)).toMatchObject([{ id: "char.wren", profile: { displayName: "Wren" }, level: 2 }]);
  });

  it("still shows a player who joined before choosing, keyed by their DID", async () => {
    const svc = services();
    await table(svc, { party: [`at://${BOB}`] });
    expect(await partyOf(svc, TABLE)).toEqual([{ player: BOB, id: BOB, profile: null, seat: null }]);
  });
});
