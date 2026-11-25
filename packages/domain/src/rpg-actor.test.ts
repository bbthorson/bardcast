import { describe, expect, it } from "vitest";
import {
  blobRefCid,
  extractRpgActorDndStats,
  fromRpgActorDndStats,
  normalizeSrdClass,
  toRpgActorBardcastStats,
  toRpgActorDndStats,
  type CharacterSheet,
} from "./index.js";

describe("rpg.actor domain schemas & mappers", () => {
  it("extracts D&D stats from both per-system rkey and legacy self records", () => {
    const perSystem = {
      $type: "actor.rpg.stats",
      system: "dnd",
      data: {
        identity: { class: "Paladin", race: "Human", level: 3 },
        abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 15 },
      },
    };
    const legacySelf = {
      $type: "actor.rpg.stats",
      dnd: {
        identity: { class: "Wizard", race: "Elf", level: 1 },
        abilities: { str: 8, dex: 14, con: 12, int: 17, wis: 13, cha: 10 },
      },
    };

    expect(extractRpgActorDndStats(perSystem)?.identity?.class).toBe("Paladin");
    expect(extractRpgActorDndStats(legacySelf)?.identity?.class).toBe("Wizard");
    expect(extractRpgActorDndStats({ system: "dcc", data: {} })).toBeNull();
    expect(extractRpgActorDndStats(null)).toBeNull();
  });

  it("normalizes free-text rpg.actor classes to SRD 5.2 class indexes", () => {
    expect(normalizeSrdClass("Paladin")).toBe("paladin");
    expect(normalizeSrdClass("Fighter 5")).toBe("fighter");
    expect(normalizeSrdClass("Rogue / Bard")).toBe("rogue");
    expect(normalizeSrdClass("Artificer")).toBeUndefined();
    expect(normalizeSrdClass("")).toBeUndefined();
  });

  it("maps actor.rpg.stats/dnd into a Bardcast import draft with helpful notes", () => {
    const draft = fromRpgActorDndStats(
      {
        identity: {
          race: "Half-Elf",
          class: "Paladin",
          level: 4,
          background: "Acolyte",
          alignment: "Lawful Good",
        },
        abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 15 },
        equipment: {
          weapons: "Longsword, Javelin",
          armor: "Chain Mail",
          gear: "Explorer's Pack; Holy Symbol",
        },
        personality: {
          traits: "Speaks softly around strangers\nPolishes her shield when nervous",
          ideals: "Mercy over vengeance",
          bonds: "Owes a debt to the Abbey of St. Jude",
          flaws: "Never forgets a slight",
          backstory: "A guilt-ridden paladin who left her order. She wanders the green road.",
        },
        features: "Divine Sense\nLay on Hands",
      },
      { displayName: "Elara" },
    );

    expect(draft.displayName).toBe("Elara");
    expect(draft.class).toBe("paladin");
    expect(draft.species).toBe("Half-Elf");
    expect(draft.background).toBe("Acolyte");
    expect(draft.abilitiesComplete).toBe(true);
    expect(draft.abilities).toEqual({
      strength: 16,
      dexterity: 10,
      constitution: 14,
      intelligence: 8,
      wisdom: 12,
      charisma: 15,
    });
    expect(draft.concept).toBe("A guilt-ridden paladin who left her order.");
    expect(draft.drives).toEqual(["Mercy over vengeance", "Owes a debt to the Abbey of St. Jude"]);
    expect(draft.quirks).toEqual([
      "Speaks softly around strangers",
      "Polishes her shield when nervous",
      "Never forgets a slight",
    ]);
    expect(draft.features).toEqual(["Divine Sense", "Lay on Hands"]);
    expect(draft.equipment.map((i) => `${i.kind}:${i.name}`)).toEqual([
      "weapon:Longsword",
      "weapon:Javelin",
      "armor:Chain Mail",
      "gear:Explorer's Pack",
      "gear:Holy Symbol",
    ]);
    expect(draft.notes).toHaveLength(1);
    expect(draft.notes[0]).toContain("level 4");
  });

  it("handles partial ability scores and unrecognized classes gracefully", () => {
    const draft = fromRpgActorDndStats({
      identity: { class: "Blood Hunter" },
      abilities: { str: 14, dex: 16 },
    });

    expect(draft.class).toBeUndefined();
    expect(draft.abilitiesComplete).toBe(false);
    expect(draft.abilities.constitution).toBe(10);
    expect(draft.notes).toHaveLength(2);
  });

  it("projects a Bardcast sheet to actor.rpg.stats/dnd and actor.rpg.stats/bardcast", () => {
    const sheet: CharacterSheet = {
      character: "at://did:plc:alice/game.bardcast.character.profile/3k2a",
      class: "fighter",
      species: "Human",
      background: "Soldier",
      abilities: {
        strength: 15,
        dexterity: 13,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
      features: ["Second Wind"],
      advancements: [
        {
          level: 2,
          hitPoints: 6,
          features: ["Action Surge"],
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      traits: [{ name: "stoic", value: "says little before a fight" }],
      quirks: ["counts arrows twice"],
      equipment: [
        { id: "w1", name: "Longsword", kind: "weapon", bonus: 0, equipped: true, source: "start" },
        { id: "a1", name: "Chain Mail", kind: "armor", bonus: 0, equipped: true, source: "start" },
      ],
      createdAt: "2026-10-01T00:00:00.000Z",
    };

    const profile = {
      displayName: "Gawain",
      concept: "a knight bound by a winter promise",
      pronouns: "he/him",
      drives: ["keep his word at the Green Chapel"],
    };

    const dnd = toRpgActorDndStats(profile, sheet);
    expect(dnd.identity).toEqual({
      class: "Fighter",
      level: 2,
      proficiency: 2,
      race: "Human",
      background: "Soldier",
    });
    expect(dnd.abilities).toEqual({ str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 });
    // Fighter d10 + 2 con = 12 at level 1, plus 6 + 2 con = 8 at level 2 -> 20
    expect(dnd.hp).toEqual({ current: 20, max: 20 });
    expect(dnd.equipment).toEqual({ weapons: "Longsword", armor: "Chain Mail" });
    expect(dnd.features).toBe("Second Wind\nAction Surge");

    const bardcast = toRpgActorBardcastStats(profile, sheet);
    expect(bardcast._meta).toEqual({ name: "Bardcast" });
    expect(bardcast.name).toBe("Gawain");
    expect(bardcast.level).toBe(2);
    expect(bardcast.drives).toEqual(["keep his word at the Green Chapel"]);
  });

  it("extracts CIDs from both $link and string blob refs", () => {
    expect(blobRefCid({ ref: { $link: "bafkreiabc" }, mimeType: "image/png" })).toBe("bafkreiabc");
    expect(blobRefCid({ ref: "bafkreixyz" })).toBe("bafkreixyz");
    expect(blobRefCid(undefined)).toBeNull();
  });
});
