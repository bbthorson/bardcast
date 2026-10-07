import { describe, expect, it } from "vitest";
import { applyActions, type CampaignAction, type ActionEffect } from "./action.js";
import { equipmentAfter, type Item } from "./items.js";
import { bringHome, joinCampaign, playSeat } from "./seat.js";
import { CharacterSheet } from "./sheet.js";

const T = "2026-10-01T00:00:00.000Z";
const NOW = "2026-10-07T00:00:00.000Z";
const GAWAIN = "at://did:plc:alice/game.bardcast.character.profile/3kgawain";
const REF = { uri: "at://did:plc:alice/game.bardcast.character.sheet/3kv1", cid: "bafyv1" };

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  name: id,
  kind: "weapon",
  bonus: 0,
  equipped: false,
  source: "found",
  ...extra,
});

const act = (effect: Partial<ActionEffect>, label = "something happens"): CampaignAction => ({
  campaign: "at://campaign.thornwood",
  chapter: "at://campaign.thornwood/chapter/1",
  beat: 0,
  actor: "The Green Knight",
  kind: "other",
  label,
  effects: [{ target: GAWAIN, conditionsAdded: [], conditionsRemoved: [], itemsGained: [], itemsLost: [], itemsChanged: [], ...effect }],
  createdAt: T,
});

const sheet = (equipment: Item[] = []) =>
  CharacterSheet.parse({
    character: GAWAIN,
    class: "fighter",
    abilities: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 13, charisma: 10 },
    equipment,
    createdAt: T,
  });

describe("the action log", () => {
  it("moves hit points up and down within the maximum, and a rest restores them", () => {
    const replay = (actions: CampaignAction[]) => applyActions({ character: GAWAIN, maxHitPoints: 12, startingItems: [], actions });
    expect(replay([act({ hitPoints: -5 })]).hitPoints).toBe(7);
    expect(replay([act({ hitPoints: -50 })]).hitPoints).toBe(0);
    expect(replay([act({ hitPoints: -5 }), act({ hitPoints: 20 })]).hitPoints).toBe(12);
    expect(replay([act({ hitPoints: -9 }), act({ restore: true })]).hitPoints).toBe(12);
  });

  it("tracks conditions and items, and ignores effects aimed at someone else", () => {
    const state = applyActions({
      character: GAWAIN,
      maxHitPoints: 12,
      startingItems: [item("longsword", { source: "start", equipped: true })],
      actions: [
        act({ conditionsAdded: ["frightened"] }),
        act({ itemsGained: [item("green-girdle", { kind: "gear" })] }),
        act({ itemsChanged: [item("longsword", { source: "start", equipped: true, bonus: 1 })] }),
        act({ conditionsRemoved: ["frightened"], conditionsAdded: ["poisoned"] }),
        { ...act({ hitPoints: -8 }), effects: [{ ...act({ hitPoints: -8 }).effects[0]!, target: "at://someone-else" }] },
      ],
    });
    expect(state.hitPoints).toBe(12);
    expect(state.conditions).toEqual(["poisoned"]);
    expect(state.items.map((i) => [i.id, i.bonus])).toEqual([["longsword", 1], ["green-girdle", 0]]);
  });

  it("never touches the player's own sheet's numbers", () => {
    const own = sheet();
    const seat = joinCampaign({ campaign: "at://campaign.thornwood", sheet: own, sheetRef: REF, startingLevel: 1, createdAt: T });
    const state = applyActions({ character: GAWAIN, maxHitPoints: 12, startingItems: [], actions: [act({ hitPoints: -10 })] });
    const played = playSeat({ ...seat, state })!;
    expect(played.hitPoints).toBe(2);
    expect(played.maxHitPoints).toBe(12);
    expect(own.equipment).toEqual([]);
  });
});

describe("gear", () => {
  const sword = item("their-sword", { source: "found", bonus: 2 });

  it("starts with the table's kit by default, and their own gear when the table allows it", () => {
    const kit = [item("longsword"), item("chain-mail", { kind: "armor" })];
    const starting = joinCampaign({ campaign: "at://c", sheet: sheet([sword]), sheetRef: REF, startingLevel: 1, startingKit: kit, createdAt: T });
    expect(starting.startingItems.map((i) => [i.id, i.source])).toEqual([["longsword", "start"], ["chain-mail", "start"]]);

    const bring = joinCampaign({ campaign: "at://c", sheet: sheet([sword]), sheetRef: REF, startingLevel: 1, gearPolicy: "bring", createdAt: T });
    expect(bring.startingItems.map((i) => [i.id, i.source])).toEqual([["their-sword", "brought"]]);
  });

  it("comes home when the seat closes: found and enchanted gear, not the plain starting kit", () => {
    const start = [item("longsword", { source: "start" }), item("shield", { kind: "shield", source: "start" })];
    const final = [item("longsword", { source: "start", bonus: 1 }), item("shield", { kind: "shield", source: "start" }), item("green-girdle", { kind: "gear" })];
    expect(equipmentAfter([sword], start, final).map((i) => i.id)).toEqual(["their-sword", "longsword", "green-girdle"]);
  });

  it("stays lost if it was brought and lost at the table", () => {
    const start = [{ ...sword, source: "brought" as const }];
    expect(equipmentAfter([sword], start, [])).toEqual([]);
  });

  it("brings gear home even when no levels were earned", () => {
    const own = sheet();
    const seat = {
      ...joinCampaign({ campaign: "at://c", sheet: own, sheetRef: REF, startingLevel: 1, createdAt: T }),
      state: { hitPoints: 3, conditions: ["poisoned"], items: [item("green-girdle", { kind: "gear" })] },
      closedAt: NOW,
    };
    const result = bringHome(seat, { current: own, currentRef: REF, seatUri: "at://c/seat", now: NOW });
    expect(result.kind).toBe("update");
    if (result.kind !== "update") return;
    expect(result.sheet.equipment.map((i) => i.id)).toEqual(["green-girdle"]);
    expect(result.sheet.prev).toEqual(REF);
  });
});
