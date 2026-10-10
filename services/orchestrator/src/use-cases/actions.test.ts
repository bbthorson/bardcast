import { CharacterSheet, Collections, joinCampaign, playSeat, type ActionEffect, type Item } from "@bardcast/domain";
import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../adapters/in-memory-store.js";
import type { CoreServices } from "../ports/index.js";
import { closeSeat, commitChapterActions, refreshSeatStates } from "./actions.js";
import { bringProgressHome, currentSheet, writeSheetVersion } from "./sheets.js";

const CAMPAIGN = "campaign.thornwood";
const CHAR = "char.gawain";
const PLAYER = "did:plc:alice";
const PROFILE = `at://${PLAYER}/${Collections.characterProfile}/3kgawain`;
const T = "2026-10-01T00:00:00.000Z";

const sword: Item = { id: "longsword", name: "Longsword", kind: "weapon", srd: "longsword", bonus: 0, equipped: true, source: "start" };

async function seated() {
  let tick = 0;
  const svc = {
    store: new InMemoryStore(),
    clock: () => new Date(Date.parse("2026-10-07T00:00:00.000Z") + tick++ * 1000),
  } as unknown as CoreServices;
  await svc.store.putCharacter(CHAR, { player: PLAYER, displayName: "Gawain", drives: [], createdAt: T });
  const sheet = CharacterSheet.parse({
    character: PROFILE,
    class: "fighter",
    abilities: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 13, charisma: 10 },
    createdAt: T,
  });
  const ref = await writeSheetVersion(svc, CHAR, sheet);
  const seat = joinCampaign({ campaign: `at://${CAMPAIGN}`, sheet, sheetRef: ref, startingLevel: 1, startingKit: [sword], createdAt: T });
  await svc.store.putSeat(CAMPAIGN, CHAR, seat);
  return svc;
}

const effect = (e: Partial<ActionEffect>): ActionEffect => ({
  target: PROFILE,
  conditionsAdded: [],
  conditionsRemoved: [],
  itemsGained: [],
  itemsLost: [],
  itemsChanged: [],
  ...e,
});

describe("the action log", () => {
  it("derives seat state from committed chapters, leaving the player's sheet alone", async () => {
    const svc = await seated();
    const before = await currentSheet(svc, CHAR);

    await commitChapterActions(svc, {
      campaignId: CAMPAIGN,
      chapter: `at://${CAMPAIGN}/chapter/1`,
      actions: [
        { beat: 0, actor: "The Green Knight", kind: "attack", label: "The axe falls", effects: [effect({ hitPoints: -9 })] },
        { beat: 1, actor: PROFILE, kind: "item", label: "Gawain accepts the green girdle", effects: [effect({ itemsGained: [{ id: "green-girdle", name: "Green girdle", kind: "gear", bonus: 0, equipped: true, source: "given" }] })] },
      ],
    });
    await commitChapterActions(svc, {
      campaignId: CAMPAIGN,
      chapter: `at://${CAMPAIGN}/chapter/2`,
      actions: [
        { beat: 0, actor: "Bertilak's smith", kind: "item", label: "The smith re-edges the longsword", effects: [effect({ itemsChanged: [{ ...sword, bonus: 1 }] })] },
        { beat: 1, actor: PROFILE, kind: "heal", label: "A night at Hautdesert", effects: [effect({ hitPoints: 4 })] },
      ],
    });

    const played = playSeat((await svc.store.getSeat(CAMPAIGN, CHAR))!)!;
    expect(played.maxHitPoints).toBe(12);
    expect(played.hitPoints).toBe(7);
    expect(played.items.map((i) => [i.id, i.bonus])).toEqual([["longsword", 1], ["green-girdle", 0]]);
    expect(await currentSheet(svc, CHAR)).toEqual(before);
    expect(await svc.store.listActions(CAMPAIGN)).toHaveLength(4);
  });

  it("is append-only and validates a whole chapter before writing any of it", async () => {
    const svc = await seated();
    const [uri] = await commitChapterActions(svc, {
      campaignId: CAMPAIGN,
      chapter: `at://${CAMPAIGN}/chapter/1`,
      actions: [{ beat: 0, actor: "Fate", kind: "damage", label: "A fall", effects: [effect({ hitPoints: -1 })] }],
    });
    const logged = (await svc.store.listActions(CAMPAIGN))[0]!.action;
    await expect(svc.store.putAction(CAMPAIGN, uri!, logged)).rejects.toThrow();

    await expect(
      commitChapterActions(svc, {
        campaignId: CAMPAIGN,
        chapter: `at://${CAMPAIGN}/chapter/2`,
        actions: [
          { beat: 0, actor: "Fate", kind: "damage", label: "Fine", effects: [] },
          { beat: -1, actor: "Fate", kind: "damage", label: "Broken", effects: [] },
        ],
      }),
    ).rejects.toThrow();
    expect(await svc.store.listActions(CAMPAIGN)).toHaveLength(1);
  });

  it("gives the same state however many times it's replayed", async () => {
    const svc = await seated();
    await commitChapterActions(svc, {
      campaignId: CAMPAIGN,
      chapter: `at://${CAMPAIGN}/chapter/1`,
      actions: [{ beat: 0, actor: "Fate", kind: "damage", label: "A fall", effects: [effect({ hitPoints: -3, conditionsAdded: ["prone"] })] }],
    });
    const once = await svc.store.getSeat(CAMPAIGN, CHAR);
    await refreshSeatStates(svc, CAMPAIGN);
    expect(await svc.store.getSeat(CAMPAIGN, CHAR)).toEqual(once);
  });

  it("keeps gear at the table until the seat closes, then brings it home without the hit points", async () => {
    const svc = await seated();
    await commitChapterActions(svc, {
      campaignId: CAMPAIGN,
      chapter: `at://${CAMPAIGN}/chapter/1`,
      actions: [
        { beat: 0, actor: "Bertilak's smith", kind: "item", label: "Re-edged", effects: [effect({ itemsChanged: [{ ...sword, bonus: 1 }], hitPoints: -5 })] },
      ],
    });
    expect((await bringProgressHome(svc, { campaignId: CAMPAIGN, characterId: CHAR })).kind).toBe("seat-open");

    await closeSeat(svc, CAMPAIGN, CHAR);
    const result = await bringProgressHome(svc, { campaignId: CAMPAIGN, characterId: CHAR });
    expect(result.kind).toBe("update");
    const home = (await currentSheet(svc, CHAR))!.sheet;
    expect(home.equipment.map((i) => [i.id, i.bonus, i.equipped])).toEqual([["longsword", 1, false]]);
    expect(home).not.toHaveProperty("hitPoints");
  });
});
