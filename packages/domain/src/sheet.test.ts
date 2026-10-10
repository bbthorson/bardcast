import { describe, expect, it } from "vitest";
import { bringHome, chooseHistory, joinCampaign, playSeat, seatSheet, type CampaignSeat } from "./seat.js";
import { classes } from "@bardcast/srd";
import { CharacterSheet, hitDieOf, SRD_CLASS_INDEXES, levelOf, levelUp, nextVersion, playSheet, proficiencyBonus, sheetAtLevel, type Advancement } from "./sheet.js";

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
  it("takes its class list and hit dice from the SRD data", () => {
    expect([...SRD_CLASS_INDEXES]).toEqual(classes.map((c) => c.index));
    expect(hitDieOf("fighter")).toBe(10);
  });

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
    expect(playSeat({ ...seat, state: { hitPoints: 4, conditions: [], items: [] } })?.hitPoints).toBe(4);
    expect(playSeat({ ...seat, state: { hitPoints: 99, conditions: [], items: [] } })?.hitPoints).toBe(12);
  });
});

describe("versions", () => {
  it("never edits a version: a change is a new one pointing back", () => {
    const v1 = gawain(1);
    const frozen = structuredClone(v1);
    const v2 = levelUp(v1, REF, adv(2), NOW);
    expect(v1).toEqual(frozen);
    expect(v2.prev).toEqual(REF);
    expect(v2.createdAt).toBe(NOW);
    expect(levelOf(v2)).toBe(2);
    expect(() => levelUp(v1, REF, adv(3), NOW)).toThrow(); // levels can't skip
  });

  it("carries the narrative face forward unless changed", () => {
    const v2 = nextVersion(gawain(1), REF, { quirks: ["Keeps the green girdle"] }, NOW);
    expect(v2.quirks).toEqual(["Keeps the green girdle"]);
    expect(v2.class).toBe("fighter");
  });
});

describe("bringing progress home", () => {
  const SEAT_URI = "at://did:web:bardcast/space/campaign/thornwood/did:plc:alice/game.bardcast.campaign.seat/did:plc:alice";
  const home = (current: CharacterSheet) => ({ current, currentRef: REF, seatUri: SEAT_URI, now: NOW });
  const sat = (sheet: CharacterSheet, startingLevel: number, earned: Advancement[], open = false): CampaignSeat => ({
    ...joinCampaign({ campaign: "at://campaign.thornwood", sheet, sheetRef: REF, startingLevel, createdAt: T }),
    advancements: earned,
    ...(open ? {} : { closedAt: NOW }),
  });

  it("waits until the seat closes", () => {
    const current = gawain(3);
    expect(bringHome(sat(current, 3, [adv(4)], true), home(current)).kind).toBe("seat-open");
  });

  it("makes a new version with the table's levels when the current one hasn't moved", () => {
    const current = gawain(3);
    const frozen = structuredClone(current);
    const result = bringHome(sat(current, 3, [adv(4), adv(5)]), home(current));
    expect(result.kind).toBe("update");
    if (result.kind !== "update") return;
    expect(levelOf(result.sheet)).toBe(5);
    expect(result.sheet.prev).toEqual(REF);
    expect(result.sheet.fromSeat).toBe(SEAT_URI);
    expect(result.sheet.quirks).toEqual(current.quirks);
    expect(current).toEqual(frozen);
  });

  it("has nothing new when the table is behind and no gear changed", () => {
    const current = gawain(8);
    expect(bringHome(sat(current, 3, [adv(4)]), home(current)).kind).toBe("nothing-new");
  });

  it("asks the player when both have levelled differently", () => {
    const seat = sat(gawain(3), 3, [adv(4), adv(5), adv(6)]);
    // Meanwhile, another table took their sheet to 5 with different rolls.
    const current = gawain(5, (a) => (a.level >= 4 ? { ...a, hitPoints: 9 } : a));
    const result = bringHome(seat, home(current));
    expect(result).toMatchObject({ kind: "diverged", fromLevel: 4 });
    if (result.kind !== "diverged") return;
    const taken = chooseHistory(result, "table", home(current));
    expect(levelOf(taken!)).toBe(6);
    expect(taken!.prev).toEqual(REF);
    expect(chooseHistory(result, "owned", home(current))).toBeNull();
  });

  it("never changes the seat", () => {
    const current = gawain(3);
    const seat = sat(current, 3, [adv(4)]);
    const before = structuredClone(seat);
    bringHome(seat, home(current));
    expect(seat).toEqual(before);
  });
});
