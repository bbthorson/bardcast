import { z } from "zod";

/**
 * The shapes Bardcast keeps from the SRD: only the fields creation and play
 * use, renamed into our vocabulary. The generated data is checked against these
 * at import and again in tests.
 */

export const Ability = z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);
export type Ability = z.infer<typeof Ability>;

export const Ref = z.object({ index: z.string(), name: z.string() });
export type Ref = z.infer<typeof Ref>;

/** One way to take a starting kit: these items, this much gold, and any "one of your choice" picks. */
export const KitOption = z.object({
  items: z.array(z.object({ equipment: z.string(), count: z.number().int().min(1) })),
  gold: z.number().int().min(0),
  /** "One gaming set of your choice", "an artisan's tool or a musical instrument": pick from these categories. */
  choices: z.array(
    z.object({ description: z.string(), choose: z.number().int().min(1), categories: z.array(Ref).min(1) }),
  ),
});
export type KitOption = z.infer<typeof KitOption>;

/** A starting kit: choose one option. `description` is the SRD's own wording. */
export const Kit = z.object({ description: z.string(), options: z.array(KitOption).min(1) });
export type Kit = z.infer<typeof Kit>;

export const ProficiencyChoice = z.object({
  description: z.string(),
  choose: z.number().int().min(1),
  /** Proficiency indexes, e.g. "skill-stealth". */
  from: z.array(z.string()),
});
export type ProficiencyChoice = z.infer<typeof ProficiencyChoice>;

export const ClassLevel = z.object({
  level: z.number().int().min(1).max(20),
  proficiencyBonus: z.number().int().min(2).max(6),
  /** Feature indexes gained at this level. */
  features: z.array(z.string()),
});

export const SrdClass = z.object({
  index: z.string(),
  name: z.string(),
  hitDie: z.number().int(),
  /** "Strength or Dexterity" (anyOf) vs "Dexterity and Wisdom" (both matter). */
  primaryAbility: z.object({ description: z.string(), abilities: z.array(Ability).min(1), anyOf: z.boolean() }),
  savingThrows: z.array(Ability).length(2),
  proficiencies: z.array(Ref),
  proficiencyChoices: z.array(ProficiencyChoice),
  startingKit: Kit,
  levels: z.array(ClassLevel).length(20),
  subclass: z.object({
    index: z.string(),
    name: z.string(),
    levels: z.array(z.object({ level: z.number().int(), features: z.array(z.string()) })),
  }),
});
export type SrdClass = z.infer<typeof SrdClass>;

export const Feature = z.object({
  index: z.string(),
  name: z.string(),
  class: z.string(),
  subclass: z.string().optional(),
  level: z.number().int().min(1).max(20),
  description: z.string(),
});
export type Feature = z.infer<typeof Feature>;

export const SpeciesTrait = z.object({ index: z.string(), name: z.string(), description: z.string() });
export type SpeciesTrait = z.infer<typeof SpeciesTrait>;

export const Species = z.object({
  index: z.string(),
  name: z.string(),
  creatureType: z.string(),
  /** One size, or the sizes a player chooses between. */
  sizes: z.array(z.string()).min(1),
  speed: z.number().int(),
  /** Trait indexes every member has. */
  traits: z.array(z.string()),
  /** Lineages (the SRD's subspecies), each with its own traits. */
  lineages: z.array(z.object({ index: z.string(), name: z.string(), damageType: z.string().optional(), traits: z.array(z.string()) })),
});
export type Species = z.infer<typeof Species>;

export const Background = z.object({
  index: z.string(),
  name: z.string(),
  /** The three abilities a background can raise (+2/+1, or +1 to all three). */
  abilityScores: z.array(Ability).length(3),
  feat: z.object({ index: z.string(), note: z.string().optional() }),
  /** Skill indexes, e.g. "athletics". */
  skills: z.array(z.string()),
  tools: z.array(Ref),
  startingKit: Kit,
});
export type Background = z.infer<typeof Background>;

export const Feat = z.object({
  index: z.string(),
  name: z.string(),
  type: z.enum(["origin", "general", "fighting-style", "epic-boon"]),
  description: z.string(),
});
export type Feat = z.infer<typeof Feat>;

const Cost = z.object({ quantity: z.number(), unit: z.string() });
const Damage = z.object({ dice: z.string().regex(/^\d+d\d+$|^\d+$/), type: z.string() });

export const Weapon = z.object({
  kind: z.literal("weapon"),
  index: z.string(),
  name: z.string(),
  category: z.enum(["simple", "martial"]),
  range: z.enum(["melee", "ranged"]),
  damage: Damage,
  twoHandedDamage: Damage.optional(),
  /** Weapon property indexes: "finesse", "versatile", "two-handed"… */
  properties: z.array(z.string()),
  mastery: z.string().optional(),
  /** In feet: normal and long range, for ranged and thrown weapons. */
  normalRange: z.number().int().optional(),
  longRange: z.number().int().optional(),
  ammunition: z.string().optional(),
  cost: Cost.optional(),
  weight: z.number().optional(),
});
export type Weapon = z.infer<typeof Weapon>;

export const Armor = z.object({
  kind: z.literal("armor"),
  index: z.string(),
  name: z.string(),
  category: z.enum(["light", "medium", "heavy", "shield"]),
  /** Base AC, or the bonus for a shield. */
  baseAc: z.number().int(),
  dexBonus: z.boolean(),
  /** Cap on the Dexterity modifier (medium armor: 2). Absent means no cap. */
  maxDexBonus: z.number().int().optional(),
  strMinimum: z.number().int().optional(),
  stealthDisadvantage: z.boolean(),
  cost: Cost.optional(),
  weight: z.number().optional(),
});
export type Armor = z.infer<typeof Armor>;

export const Gear = z.object({
  kind: z.literal("gear"),
  index: z.string(),
  name: z.string(),
  categories: z.array(z.string()),
  /** For packs: what's inside. */
  contents: z.array(z.object({ equipment: z.string(), quantity: z.number().int() })).optional(),
  cost: Cost.optional(),
  weight: z.number().optional(),
});
export type Gear = z.infer<typeof Gear>;

export const Equipment = z.discriminatedUnion("kind", [Weapon, Armor, Gear]);
export type Equipment = z.infer<typeof Equipment>;

export const Rule = z.object({ index: z.string(), name: z.string(), description: z.string() });
export type Rule = z.infer<typeof Rule>;

export const Skill = z.object({ index: z.string(), name: z.string(), ability: Ability, description: z.string() });
export type Skill = z.infer<typeof Skill>;
