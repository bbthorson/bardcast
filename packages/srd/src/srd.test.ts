import { describe, expect, it } from "vitest";
import {
  Background,
  backgrounds,
  classes,
  classFeaturesAt,
  conditions,
  equipment,
  Equipment,
  Feat,
  feats,
  Feature,
  features,
  getArmor,
  getBackground,
  getClass,
  getEquipment,
  getFeature,
  getSpecies,
  getWeapon,
  Skill,
  skills,
  species,
  Species,
  SpeciesTrait,
  speciesTraits,
  SRD_ATTRIBUTION,
  SrdClass,
} from "./index.js";

describe("the generated data", () => {
  it("matches our schemas", () => {
    const check = (schema: { parse: (v: unknown) => unknown }, xs: readonly unknown[]) => xs.forEach((x) => schema.parse(x));
    check(SrdClass, classes);
    check(Feature, features);
    check(Species, species);
    check(SpeciesTrait, speciesTraits);
    check(Background, backgrounds);
    check(Feat, feats);
    check(Equipment, equipment);
    check(Skill, skills);
  });

  it("has the whole SRD 5.2 roster", () => {
    expect(classes.map((c) => c.index)).toEqual([
      "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
    ]);
    expect(species.map((s) => s.name)).toEqual(["Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Halfling", "Human", "Orc", "Tiefling"]);
    expect(backgrounds.map((b) => b.name)).toEqual(["Acolyte", "Criminal", "Sage", "Soldier"]);
    expect(skills).toHaveLength(18);
    expect(conditions).toHaveLength(15);
    expect(equipment.filter((e) => e.kind === "armor")).toHaveLength(13);
    expect(equipment.filter((e) => e.kind === "weapon")).toHaveLength(38);
  });

  it("has no references that don't resolve", () => {
    for (const c of classes) {
      for (const f of classFeaturesAt(c.index, 20)) expect(getFeature(f), `${c.index}: ${f}`).toBeDefined();
      for (const o of c.startingKit.options) for (const i of o.items) expect(getEquipment(i.equipment), `${c.index}: ${i.equipment}`).toBeDefined();
    }
    for (const b of backgrounds) {
      expect(feats.some((f) => f.index === b.feat.index)).toBe(true);
      for (const o of b.startingKit.options) for (const i of o.items) expect(getEquipment(i.equipment), `${b.index}: ${i.equipment}`).toBeDefined();
    }
  });

  it("has no encoding damage left in any text", () => {
    const text = JSON.stringify([classes, features, species, speciesTraits, backgrounds, feats, equipment, skills, conditions]);
    expect(text).not.toMatch(/â€|Ã./);
  });
});

/** Values checked against the SRD 5.2 itself. */
describe("spot checks against the SRD", () => {
  it("classes: hit dice, saves, primary abilities, proficiency bonus", () => {
    expect(Object.fromEntries(classes.map((c) => [c.index, c.hitDie]))).toMatchObject({ barbarian: 12, fighter: 10, rogue: 8, wizard: 6, sorcerer: 6 });
    expect(getClass("fighter")).toMatchObject({
      savingThrows: ["strength", "constitution"],
      primaryAbility: { abilities: ["strength", "dexterity"], anyOf: true },
    });
    expect(getClass("monk")!.primaryAbility).toMatchObject({ abilities: ["dexterity", "wisdom"], anyOf: false });
    expect(getClass("rogue")!.levels.map((l) => l.proficiencyBonus)).toEqual([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
    expect(classFeaturesAt("fighter", 1)).toContain("fighter-second-wind");
  });

  it("weapons: longsword and dagger", () => {
    expect(getWeapon("longsword")).toMatchObject({
      category: "martial",
      range: "melee",
      damage: { dice: "1d8", type: "slashing" },
      twoHandedDamage: { dice: "1d10", type: "slashing" },
      properties: ["versatile"],
      mastery: "sap",
    });
    expect(getWeapon("dagger")).toMatchObject({
      category: "simple",
      damage: { dice: "1d4", type: "piercing" },
      mastery: "nick",
      normalRange: 20,
      longRange: 60,
    });
    expect(getWeapon("dagger")!.properties).toEqual(expect.arrayContaining(["finesse", "light", "thrown"]));
  });

  it("armor: the table", () => {
    expect(getArmor("chain-mail")).toMatchObject({ category: "heavy", baseAc: 16, dexBonus: false, strMinimum: 13, stealthDisadvantage: true });
    expect(getArmor("plate-armor")).toMatchObject({ category: "heavy", baseAc: 18, strMinimum: 15 });
    expect(getArmor("breastplate")).toMatchObject({ category: "medium", baseAc: 14, dexBonus: true, maxDexBonus: 2, stealthDisadvantage: false });
    expect(getArmor("leather-armor")).toMatchObject({ category: "light", baseAc: 11, dexBonus: true });
    expect(getArmor("leather-armor")!.maxDexBonus).toBeUndefined();
    expect(getArmor("shield")).toMatchObject({ category: "shield", baseAc: 2 });
  });

  it("corrections to the source: hide is medium armor, humans can be Small", () => {
    expect(getArmor("hide-armor")).toMatchObject({ category: "medium", baseAc: 12, maxDexBonus: 2 });
    expect(getSpecies("human")!.sizes).toEqual(["Medium", "Small"]);
    expect(getSpecies("tiefling")!.sizes).toEqual(["Small", "Medium"]);
  });

  it("species: speed and lineage traits", () => {
    expect(getSpecies("goliath")!.speed).toBe(35);
    const dragonborn = getSpecies("dragonborn")!;
    expect(dragonborn.traits).toEqual(expect.arrayContaining(["darkvision-60", "draconic-flight", "draconic-ancestry"]));
    expect(dragonborn.lineages.find((l) => l.index === "draconic-ancestor-red")!.traits).toContain("draconic-breath-weapon-fire");
  });

  it("backgrounds: abilities, feat, skills, and a 'one of your choice' kit pick", () => {
    expect(getBackground("soldier")).toMatchObject({
      abilityScores: ["strength", "dexterity", "constitution"],
      feat: { index: "savage-attacker" },
      skills: ["athletics", "intimidation"],
    });
    expect(getBackground("acolyte")).toMatchObject({ abilityScores: ["intelligence", "wisdom", "charisma"], feat: { index: "magic-initiate" } });
    const cleric = getClass("cleric")!.startingKit.options[0]!;
    expect(cleric.choices.flatMap((c) => c.categories.map((x) => x.index))).toContain("holy-symbols");
    expect(cleric.items.map((i) => i.equipment)).not.toContain("holy-symbols");
  });

  it("carries the attribution CC-BY requires", () => {
    expect(SRD_ATTRIBUTION).toContain("System Reference Document 5.2");
    expect(SRD_ATTRIBUTION).toContain("Creative Commons Attribution 4.0");
  });
});
