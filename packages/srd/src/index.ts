/**
 * @bardcast/srd: a typed subset of the D&D System Reference Document 5.2
 * (CC-BY-4.0). The data in ./generated is produced by scripts/import.ts from a
 * pinned commit (./source.ts) and checked in; never edit it by hand. Anything
 * that shows SRD material to people must also show SRD_ATTRIBUTION.
 */
import type { Armor, Equipment, Weapon } from "./schema.js";
import { backgrounds } from "./generated/backgrounds.js";
import { classes } from "./generated/classes.js";
import { conditions } from "./generated/conditions.js";
import { equipment } from "./generated/equipment.js";
import { feats } from "./generated/feats.js";
import { features } from "./generated/features.js";
import { skills } from "./generated/skills.js";
import { species } from "./generated/species.js";
import { speciesTraits } from "./generated/species-traits.js";
import { weaponMasteries } from "./generated/weapon-masteries.js";
import { weaponProperties } from "./generated/weapon-properties.js";

export * from "./schema.js";
export * from "./source.js";
export {
  backgrounds,
  classes,
  conditions,
  equipment,
  feats,
  features,
  skills,
  species,
  speciesTraits,
  weaponMasteries,
  weaponProperties,
};

function indexer<T extends { index: string }>(entries: readonly T[]): (index: string) => T | undefined {
  const map = new Map(entries.map((e) => [e.index, e]));
  return (index) => map.get(index);
}

export const getClass = indexer(classes);
export const getFeature = indexer(features);
export const getSpecies = indexer(species);
export const getSpeciesTrait = indexer(speciesTraits);
export const getBackground = indexer(backgrounds);
export const getFeat = indexer(feats);
export const getEquipment = indexer(equipment);
export const getSkill = indexer(skills);
export const getCondition = indexer(conditions);

export function getWeapon(index: string): Weapon | undefined {
  const e: Equipment | undefined = getEquipment(index);
  return e?.kind === "weapon" ? e : undefined;
}

export function getArmor(index: string): Armor | undefined {
  const e: Equipment | undefined = getEquipment(index);
  return e?.kind === "armor" ? e : undefined;
}

/** Every class and subclass feature a character of this class has at `level`, in the order gained. */
export function classFeaturesAt(classIndex: string, level: number): string[] {
  const c = getClass(classIndex);
  if (!c) throw new Error(`no SRD class ${classIndex}`);
  return [...c.levels, ...c.subclass.levels]
    .filter((l) => l.level <= level)
    .sort((a, b) => a.level - b.level)
    .flatMap((l) => l.features);
}
