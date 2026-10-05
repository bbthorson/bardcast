import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedGawainCampaign } from "../postgres/migrate.js";
import { migrateD1, type D1Database } from "./d1.js";
import { D1Store } from "./d1-store.js";
import { sqliteD1 } from "./sqlite-d1.js";

// The same cases as postgres-store.test.ts, against the SQLite dialect.
describe("D1Store (node:sqlite stand-in)", () => {
  let db: D1Database;
  let store: D1Store;

  beforeAll(async () => {
    db = sqliteD1();
    await migrateD1(db);
    await migrateD1(db); // idempotent: every isolate runs it on its first request

    store = new D1Store(db);
  });

  afterAll(() => undefined);

  it("seeds the Gawain starter campaign and reads it back", async () => {
    await seedGawainCampaign(store);
    const campaign = await store.getCampaign("gawain-green-knight");
    expect(campaign).not.toBeNull();
    expect(campaign?.title).toBe("Sir Gawain and the Green Knight");
    expect(campaign?.party).toHaveLength(4);

    const gawain = await store.getCharacter("gawain");
    expect(gawain).not.toBeNull();
    expect(gawain?.displayName).toBe("Sir Gawain");

    const sheet = await store.getSheet("gawain-green-knight", "gawain");
    expect(sheet).not.toBeNull();
    expect(sheet?.traits.length).toBeGreaterThan(0);
  });

  it("handles campaigns, filtering by DID, and invites", async () => {
    const campaignId = "campaign.test-1";
    const now = new Date().toISOString();
    await store.putCampaign(campaignId, {
      title: "The Thornwood Trial",
      dm: "did:example:dm-alice" as any,
      party: ["at://did:example:player-bob" as any],
      createdAt: now,
    });

    const read = await store.getCampaign(campaignId);
    expect(read?.title).toBe("The Thornwood Trial");

    // List by DM DID
    const dmCampaigns = await store.listCampaigns({ did: "did:example:dm-alice" });
    expect(dmCampaigns.some((c) => c.id === campaignId)).toBe(true);

    // List by Player DID
    const playerCampaigns = await store.listCampaigns({ did: "did:example:player-bob" });
    expect(playerCampaigns.some((c) => c.id === campaignId)).toBe(true);

    // Invites
    await store.createInvite("INVITE123", campaignId, "did:example:dm-alice");
    const invite = await store.getInvite("INVITE123");
    expect(invite).toMatchObject({
      code: "INVITE123",
      campaignId,
      createdBy: "did:example:dm-alice",
    });

    await store.deleteInvite("INVITE123");
    expect(await store.getInvite("INVITE123")).toBeNull();
  });

  it("isolates character sheets per campaign", async () => {
    const charId = "char.alice";
    const now = new Date().toISOString();

    await store.putCharacter(charId, {
      displayName: "Alice",
      drives: ["Seek the grail"],
      createdAt: now,
    });

    await store.putSheet("camp.1", charId, {
      campaign: "at://camp.1" as any,
      character: `at://${charId}` as any,
      traits: [{ name: "AC", value: "25", confidence: 100 }],
      sourceReplies: [],
      createdAt: now,
    });

    await store.putSheet("camp.2", charId, {
      campaign: "at://camp.2" as any,
      character: `at://${charId}` as any,
      traits: [{ name: "AC", value: "14", confidence: 100 }],
      sourceReplies: [],
      createdAt: now,
    });

    const sheet1 = await store.getSheet("camp.1", charId);
    const sheet2 = await store.getSheet("camp.2", charId);
    expect(sheet1?.traits[0]?.value).toBe("25");
    expect(sheet2?.traits[0]?.value).toBe("14");
  });

  it("persists behavior models and voice profiles", async () => {
    const charId = "char.bob";
    const now = new Date().toISOString();

    await store.putBehavior(charId, {
      modelRef: "fine-tune-123",
      exemplars: ["Never retreat", "Always split the loot"],
      sourceReplies: [],
      updatedAt: now,
    });

    const behavior = await store.getBehavior(charId);
    expect(behavior?.modelRef).toBe("fine-tune-123");
    expect(behavior?.exemplars).toContain("Never retreat");

    await store.putVoice(charId, {
      consent: true,
      status: "pvc",
      modelRef: "elevenlabs-voice-id-456",
      createdAt: now,
    });

    const voice = await store.getVoice(charId);
    expect(voice?.status).toBe("pvc");
    expect(voice?.modelRef).toBe("elevenlabs-voice-id-456");
  });

  it("persists chapters and prompts", async () => {
    const campaignId = "camp.chapters";
    const now = new Date().toISOString();

    await store.putChapter("ch.1", {
      campaign: `at://${campaignId}` as any,
      index: 1,
      title: "First Steps",
      script: [{ speaker: "narrator", text: "The tavern is quiet." }],
      status: "ready",
      rollLog: [],
      beats: [],
      createdAt: now,
    });

    await store.putChapter("ch.2", {
      campaign: `at://${campaignId}` as any,
      index: 2,
      title: "Into the Mire",
      script: [{ speaker: "gawain", text: "We press on." }],
      status: "writing",
      rollLog: [],
      beats: [],
      createdAt: now,
    });

    const chapters = await store.listChapters(campaignId);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.title).toBe("First Steps");
    expect(chapters[1]?.title).toBe("Into the Mire");

    await store.putPrompt("prompt.1", {
      campaign: `at://${campaignId}` as any,
      title: "Where did your scar come from?",
      audience: [],
      intent: "sheet",
      createdAt: now,
    });

    const prompt = await store.getPrompt("prompt.1");
    expect(prompt?.title).toBe("Where did your scar come from?");

    const prompts = await store.listPrompts(campaignId);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.title).toBe("Where did your scar come from?");
  });
});
