import { describe, expect, it } from "vitest";
import { bringHome, chooseHistory, joinCampaign, playSeat, seatSheet, type CampaignSeat } from "./seat.js";
import { CharacterSheet, levelOf, playSheet, proficiencyBonus, sheetAtLevel, type Advancement } from "./sheet.js";

const T = "2026-10-01T00:00:00Z";
const NOW = "2026-10-07T00:00:00Z";
const REF = { uri: "at://did:plc:alice/game.bardcast.character.sheet/3kgawain", cid: "bafysheet1" };

const adv = (level: number, extra: Partial<Advancement> = {}): Advancement => ({
  level,
  hitPoints: 6,
  features: [],
  createdAt: T,
  ...extra,
});

/** Gawain, a fighter, levelled to `level` with an ability increase at 4. */
function gawain(level: number, tweak: (a: Advancement) => Advancement = (a) => a): CharacterSheet {
  return CharacterSheet.parse({
    character: "at://did:plc:alice/game.bardcast.character.profile/3kgawain",
    class: "fighter",
    abilities: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 13, charisma: 10 },
    features: ["Second Wind"],
    advancements: Array.from({ length: level - 1 }, (_, i) =>
      tweak(adv(i + 2, i + 2 === 4 ? { abilityIncreases: { strength: 2 } } : {})),
    ),
    quirks: ["Courteous to a fault"],
    createdAt: T,
  });
}

describe("the player-owned sheet", () => {
  it("rejects a log with a gap in it", () => {
    const bad = { ...gawain(1), advancements: [adv(2), adv(4)] };
    expect(CharacterSheet.safeParse(bad).success).toBe(false);
  });

  it("plays out its numbers: hit points, increases, proficiency", () => {
    const p = playSheet(gawain(5));
    expect(p.level).toBe(5);
    expect(p.abilities.strength).toBe(17);
    // d10 at level 1, then four levels of 6, each +2 for Constitution 14.
    expect(p.maxHitPoints).toBe(10 + 2 + 4 * (6 + 2));
    expect(p.proficiencyBonus).toBe(3);
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(17)).toBe(6);
  });

  it("replays down to a lower level, dropping what came after", () => {
    const at3 = sheetAtLevel(gawain(8), 3);
    expect(levelOf(at3)).toBe(3);
    expect(playSheet(at3).abilities.strength).toBe(15); // the level-4 increase is gone
    expect(at3.quirks).toEqual(["Courteous to a fault"]); // who they are stays
    expect(() => sheetAtLevel(gawain(2), 5)).toThrow(RangeError);
  });
});

describe("a seat at the table", () => {
  it("resets a higher-level sheet to the table's starting level", () => {
    const seat = joinCampaign({ campaign: "at://campaign.saltmarsh", sheet: gawain(8), sheetRef: REF, startingLevel: 3, createdAt: T });
    expect(seat.sheet).toEqual(REF);
    expect(playSeat(seat)).toMatchObject({ level: 3, pendingLevels: 0 });
  });

  it("owes levels when the table starts above the sheet", () => {
    const seat = joinCampaign({ campaign: "at://campaign.saltmarsh", sheet: gawain(2), sheetRef: REF, startingLevel: 5, createdAt: T });
    expect(playSeat(seat)).toMatchObject({ level: 2, pendingLevels: 3 });
  });

  it("plays from what was brought plus what was earned, and refuses a broken chain", () => {
    const seat = joinCampaign({ campaign: "at://campaign.saltmarsh", sheet: gawain(3), sheetRef: REF, startingLevel: 3, createdAt: T });
    expect(levelOf(seatSheet({ ...seat, advancements: [adv(4)] })!)).toBe(4);
    expect(() => seatSheet({ ...seat, advancements: [adv(6)] })).toThrow();
  });

  it("keeps hit points within the maximum", () => {
    const seat = joinCampaign({ campaign: "at://campaign.saltmarsh", sheet: gawain(1), sheetRef: REF, startingLevel: 1, createdAt: T });
    expect(playSeat({ ...seat, state: { hitPoints: 4, conditions: [], gear: [] } })?.hitPoints).toBe(4);
    expect(playSeat({ ...seat, state: { hitPoints: 99, conditions: [], gear: [] } })?.hitPoints).toBe(12);
  });
});

describe("bringing progress home", () => {
  const sat = (sheet: CharacterSheet, startingLevel: number, earned: Advancement[]): CampaignSeat => ({
    ...joinCampaign({ campaign: "at://campaign.thornwood", sheet, sheetRef: REF, startingLevel, createdAt: T }),
    advancements: earned,
  });

  it("fast-forwards when the owned sheet hasn't moved", () => {
    const owned = gawain(3);
    const result = bringHome(owned, sat(owned, 3, [adv(4), adv(5)]), NOW);
    expect(result.kind).toBe("fast-forward");
    if (result.kind !== "fast-forward") return;
    expect(levelOf(result.sheet)).toBe(5);
    expect(result.sheet.quirks).toEqual(owned.quirks);
    expect(result.sheet.updatedAt).toBe(NOW);
  });

  it("has nothing new when the table is behind the owned sheet", () => {
    const owned = gawain(8);
    expect(bringHome(owned, sat(owned, 3, [adv(4)]), NOW).kind).toBe("nothing-new");
  });

  it("asks the player when both have levelled differently", () => {
    const thornwood = gawain(3);
    const seat = sat(thornwood, 3, [adv(4), adv(5), adv(6)]);
    // Meanwhile, another table took the owned sheet to 5 with different rolls.
    const owned = gawain(5, (a) => (a.level >= 4 ? { ...a, hitPoints: 9 } : a));
    const result = bringHome(owned, seat, NOW);
    expect(result).toMatchObject({ kind: "diverged", fromLevel: 4 });
    if (result.kind !== "diverged") return;
    expect(levelOf(chooseHistory(owned, result.table, "table", NOW))).toBe(6);
    expect(chooseHistory(owned, result.table, "owned", NOW)).toBe(owned);
  });

  it("never changes the seat", () => {
    const owned = gawain(3);
    const seat = sat(owned, 3, [adv(4)]);
    const before = structuredClone(seat);
    bringHome(owned, seat, NOW);
    expect(seat).toEqual(before);
  });
});
