import { cidForLex } from "@atproto/lex-cbor";
import { CharacterSheet, Collections, joinCampaign, levelUp, type Advancement } from "@bardcast/domain";
import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../adapters/in-memory-store.js";
import type { CoreServices } from "../ports/index.js";
import { closeSeat } from "./actions.js";
import { bringProgressHome, currentSheet, sheetHistory, StaleSheetError, writeSheetVersion } from "./sheets.js";

const CHAR = "char.gawain";
const PLAYER = "did:plc:alice";
const T = "2026-10-01T00:00:00.000Z";

async function setup() {
  let tick = 0;
  const svc = {
    store: new InMemoryStore(),
    clock: () => new Date(Date.parse("2026-10-07T00:00:00.000Z") + tick++ * 1000),
  } as unknown as CoreServices;
  await svc.store.putCharacter(CHAR, { player: PLAYER, displayName: "Gawain", drives: [], createdAt: T });
  return svc;
}

const adv = (level: number, hitPoints = 6): Advancement => ({ level, hitPoints, features: [], createdAt: T });

const first = (): CharacterSheet =>
  CharacterSheet.parse({
    character: `at://${PLAYER}/${Collections.characterProfile}/3kgawain`,
    class: "fighter",
    abilities: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 13, charisma: 10 },
    quirks: ["Courteous to a fault"],
    createdAt: T,
  });

describe("sheet versions", () => {
  it("writes a chain: each version points at the last, and the profile at the newest", async () => {
    const svc = await setup();
    const r1 = await writeSheetVersion(svc, CHAR, first());
    const v1 = (await currentSheet(svc, CHAR))!.sheet;
    const r2 = await writeSheetVersion(svc, CHAR, levelUp(v1, r1, adv(2), "2026-10-02T00:00:00.000Z"));

    expect((await svc.store.getCharacter(CHAR))?.sheet).toEqual(r2);
    const history = await sheetHistory(svc, CHAR);
    expect(history.map((v) => v.ref)).toEqual([r2, r1]);
    expect(history[0]!.sheet.prev).toEqual(r1);
    expect(r1.uri).toMatch(new RegExp(`^at://${PLAYER}/${Collections.characterSheet}/[a-z2-7]{13}$`));
  });

  it("refs carry the record's real CID", async () => {
    const svc = await setup();
    const ref = await writeSheetVersion(svc, CHAR, first());
    const record = { $type: Collections.characterSheet, ...JSON.parse(JSON.stringify(first())) };
    expect(ref.cid).toBe((await cidForLex(record)).toString());
  });

  it("refuses a version based on one that's no longer current", async () => {
    const svc = await setup();
    const r1 = await writeSheetVersion(svc, CHAR, first());
    await writeSheetVersion(svc, CHAR, levelUp(first(), r1, adv(2), T));
    await expect(writeSheetVersion(svc, CHAR, levelUp(first(), r1, adv(2, 9), T))).rejects.toThrow(StaleSheetError);
    await expect(writeSheetVersion(svc, CHAR, first())).rejects.toThrow(StaleSheetError);
    expect(await sheetHistory(svc, CHAR)).toHaveLength(2);
  });
});

describe("bringing progress home", () => {
  async function seated(earned: Advancement[]) {
    const svc = await setup();
    const ref = await writeSheetVersion(svc, CHAR, first());
    const seat = joinCampaign({ campaign: "at://campaign.thornwood", sheet: first(), sheetRef: ref, startingLevel: 1, createdAt: T });
    await svc.store.putSeat("campaign.thornwood", CHAR, { ...seat, advancements: earned });
    await closeSeat(svc, "campaign.thornwood", CHAR);
    return { svc, ref };
  }

  it("writes a new version with the table's levels and leaves the old one in history", async () => {
    const { svc, ref } = await seated([adv(2), adv(3)]);
    const seatBefore = await svc.store.getSeat("campaign.thornwood", CHAR);

    const result = await bringProgressHome(svc, { campaignId: "campaign.thornwood", characterId: CHAR });

    expect(result.kind).toBe("update");
    const history = await sheetHistory(svc, CHAR);
    expect(history.map((v) => v.ref)).toEqual([result.written, ref]);
    expect(history[0]!.sheet.advancements).toHaveLength(2);
    expect(history[0]!.sheet.fromSeat).toBe(`at://campaign.thornwood/${Collections.campaignSeat}/${PLAYER}`);
    expect(await svc.store.getSeat("campaign.thornwood", CHAR)).toEqual(seatBefore);
  });

  it("waits for the player's choice when the histories diverged, then forks", async () => {
    const { svc, ref } = await seated([adv(2), adv(3)]);
    // They levelled at home in the meantime, with a different roll.
    await writeSheetVersion(svc, CHAR, levelUp(first(), ref, adv(2, 9), T));

    const asked = await bringProgressHome(svc, { campaignId: "campaign.thornwood", characterId: CHAR });
    expect(asked).toMatchObject({ kind: "diverged", fromLevel: 2 });
    expect(asked.written).toBeUndefined();
    expect(await sheetHistory(svc, CHAR)).toHaveLength(2);

    const kept = await bringProgressHome(svc, { campaignId: "campaign.thornwood", characterId: CHAR, choice: "owned" });
    expect(kept.written).toBeUndefined();

    const taken = await bringProgressHome(svc, { campaignId: "campaign.thornwood", characterId: CHAR, choice: "table" });
    const history = await sheetHistory(svc, CHAR);
    expect(history[0]!.ref).toEqual(taken.written);
    expect(history[0]!.sheet.advancements.map((a) => a.hitPoints)).toEqual([6, 6]);
    // Every version is still there: the home level-up wasn't erased, just superseded.
    expect(await svc.store.listSheetVersions(CHAR)).toHaveLength(3);
  });
});
