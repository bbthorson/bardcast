/**
 * Import the SRD 5.2 subset from 5e-bits' JSON at the commit pinned in
 * src/source.ts, and write typed modules to src/generated.
 *
 *   npm run import -w @bardcast/srd               # fetch from GitHub at the pinned commit
 *   npm run import -w @bardcast/srd -- --from DIR # read 5e-SRD-*.json files from DIR
 *
 * The input is outside data: every entry is parsed with a Zod schema of the
 * fields we read, and every output entry is checked against src/schema.ts.
 * Anything unexpected stops the import rather than slipping through.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  Ability,
  Background,
  Equipment,
  Feat,
  Feature,
  Rule,
  Skill,
  Species,
  SpeciesTrait,
  SrdClass,
  type Kit,
  type KitOption,
} from "../src/schema.js";
import { SRD_SOURCE } from "../src/source.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/generated");

// --- reading ---------------------------------------------------------------

const fromIdx = process.argv.indexOf("--from");
const fromDir = fromIdx === -1 ? null : process.argv[fromIdx + 1];

async function load(name: string): Promise<unknown> {
  const file = `5e-SRD-${name}.json`;
  let text: string;
  if (fromDir) {
    text = await readFile(join(fromDir, file), "utf8");
  } else {
    const url = `https://raw.githubusercontent.com/${SRD_SOURCE.repo}/${SRD_SOURCE.commit}/${SRD_SOURCE.path}/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    text = await res.text();
  }
  return JSON.parse(text, (_key, value: unknown) => (typeof value === "string" ? repairText(value, file) : value));
}

/**
 * Some source strings were UTF-8 read as Windows-1252 somewhere upstream
 * ("artisanâ€™s"). Repair the sequences we know, and refuse anything else
 * that still looks broken.
 */
const MOJIBAKE: Array<[string, string]> = [
  ["\u00e2\u20ac\u2122", "\u2019"],
  ["\u00e2\u20ac\u02dc", "\u2018"],
  ["\u00e2\u20ac\u0153", "\u201c"],
  ["\u00e2\u20ac\u009d", "\u201d"],
  ["\u00e2\u20ac\u201c", "\u2013"],
  ["\u00e2\u20ac\u201d", "\u2014"],
  ["\u00e2\u20ac\u00a6", "\u2026"],
  ["\u00c3\u00a9", "\u00e9"],
];
function repairText(value: string, file: string): string {
  let out = value;
  for (const [bad, good] of MOJIBAKE) out = out.split(bad).join(good);
  if (/\u00e2\u20ac|\u00c3./.test(out)) throw new Error(`${file}: unrepaired encoding damage in "${out.slice(0, 80)}"`);
  return out;
}

// --- the input shapes we read (everything else is ignored) ------------------

const RRef = z.looseObject({ index: z.string(), name: z.string() });
const ABILITY: Record<string, Ability> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};
const ability = (r: { index: string }): Ability => {
  const a = ABILITY[r.index];
  if (!a) throw new Error(`unknown ability ${r.index}`);
  return a;
};

const ROption: z.ZodType<RawOption> = z.lazy(() =>
  z.union([
    z.looseObject({ option_type: z.literal("counted_reference"), count: z.number(), of: RRef }),
    z.looseObject({ option_type: z.literal("reference"), item: RRef }),
    z.looseObject({ option_type: z.literal("money"), count: z.number(), unit: z.literal("gp") }),
    z.looseObject({ option_type: z.literal("multiple"), items: z.array(ROption) }),
    z.looseObject({ option_type: z.literal("choice"), choice: RChoice }),
  ]),
);
type RawOption =
  | { option_type: "counted_reference"; count: number; of: { index: string; name: string } }
  | { option_type: "reference"; item: { index: string; name: string } }
  | { option_type: "money"; count: number; unit: "gp" }
  | { option_type: "multiple"; items: RawOption[] }
  | { option_type: "choice"; choice: RawChoice };
type RawChoice = {
  desc?: string | undefined;
  choose: number;
  from:
    | { option_set_type: "options_array"; options: RawOption[] }
    | { option_set_type: "equipment_category"; equipment_category: { index: string; name: string } };
};
const RChoice: z.ZodType<RawChoice> = z.lazy(() =>
  z.looseObject({
    desc: z.string().optional(),
    choose: z.number(),
    from: z.union([
      z.looseObject({ option_set_type: z.literal("options_array"), options: z.array(ROption) }),
      z.looseObject({ option_set_type: z.literal("equipment_category"), equipment_category: RRef }),
    ]),
  }),
);

/** The categories a "one of your choice" pick ranges over, through any nesting. Picks of specific items aren't expected here. */
function categoriesOf(choice: RawChoice, what: string): Array<{ index: string; name: string }> {
  if (choice.from.option_set_type === "equipment_category") {
    return [{ index: choice.from.equipment_category.index, name: choice.from.equipment_category.name }];
  }
  return choice.from.options.flatMap((o) => {
    if (o.option_type !== "choice" || o.choice.choose !== 1) throw new Error(`${what}: unexpected pick inside a kit choice`);
    return categoriesOf(o.choice, what);
  });
}

/** A raw "choose 1 of (A) … (B) … (C) …" into our Kit. */
function kit(raw: RawChoice[], what: string): Kit {
  if (raw.length !== 1) throw new Error(`${what}: expected one equipment choice, got ${raw.length}`);
  const choice = raw[0]!;
  if (choice.choose !== 1 || choice.from.option_set_type !== "options_array") throw new Error(`${what}: unexpected kit shape`);
  return { description: choice.desc ?? "", options: choice.from.options.map((o) => kitOption(o, what)) };
}

function kitOption(option: RawOption, what: string): KitOption {
  const out: KitOption = { items: [], gold: 0, choices: [] };
  const add = (o: RawOption) => {
    switch (o.option_type) {
      case "counted_reference":
        out.items.push({ equipment: o.of.index, count: o.count });
        break;
      case "reference":
        out.items.push({ equipment: o.item.index, count: 1 });
        break;
      case "money":
        out.gold += o.count;
        break;
      case "multiple":
        o.items.forEach(add);
        break;
      case "choice":
        out.choices.push({
          description: o.choice.desc ?? "",
          choose: o.choice.choose,
          categories: categoriesOf(o.choice, what),
        });
    }
  };
  add(option);
  return out;
}

type RawProfOption =
  | { option_type: "reference"; item: { index: string; name: string } }
  | { option_type: "choice"; choice: { from: { options: RawProfOption[] } } };
const RProfOption: z.ZodType<RawProfOption> = z.lazy(() =>
  z.union([
    z.looseObject({ option_type: z.literal("reference"), item: RRef }),
    z.looseObject({
      option_type: z.literal("choice"),
      choice: z.looseObject({ from: z.looseObject({ option_set_type: z.literal("options_array"), options: z.array(RProfOption) }) }),
    }),
  ]),
);
const RProficiencyChoice = z.looseObject({
  desc: z.string(),
  choose: z.number(),
  from: z.looseObject({ option_set_type: z.literal("options_array"), options: z.array(RProfOption) }),
});
/** "Choose one artisan's tool or one instrument" is two nested lists; we keep one flat list to pick from. */
const flattenProf = (o: RawProfOption): string[] =>
  o.option_type === "reference" ? [o.item.index] : o.choice.from.options.flatMap(flattenProf);

const RClass = z.looseObject({
  index: z.string(),
  name: z.string(),
  hit_die: z.number(),
  primary_ability: z.union([
    z.looseObject({ desc: z.string(), ability_scores: z.array(RRef) }),
    z.looseObject({
      desc: z.string(),
      ability_score_options: z.looseObject({
        choose: z.literal(1),
        from: z.looseObject({ options: z.array(z.looseObject({ option_type: z.literal("reference"), item: RRef })) }),
      }),
    }),
  ]),
  saving_throws: z.array(RRef),
  proficiencies: z.array(RRef),
  proficiency_choices: z.array(RProficiencyChoice),
  starting_equipment_options: z.array(RChoice),
  subclasses: z.array(RRef).length(1),
});

const RLevel = z.looseObject({
  level: z.number(),
  prof_bonus: z.number().optional(),
  features: z.array(RRef).default([]),
  class: RRef,
  subclass: RRef.optional(),
});

const RFeature = z.looseObject({
  index: z.string(),
  name: z.string(),
  description: z.string(),
  class: RRef,
  subclass: RRef.optional(),
  level: z.looseObject({ index: z.string() }),
});

const RSpecies = z.looseObject({
  index: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.string().optional(),
  size_options: z
    .looseObject({ from: z.looseObject({ options: z.array(z.looseObject({ option_type: z.literal("size"), size: z.string() })) }) })
    .optional(),
  speed: z.number(),
  traits: z.array(RRef),
  subspecies: z.array(RRef).optional(),
});
const RSubspecies = z.looseObject({
  index: z.string(),
  name: z.string(),
  species: RRef,
  damage_type: RRef.optional(),
  traits: z.array(RRef),
});
const RTrait = z.looseObject({
  index: z.string(),
  name: z.string(),
  description: z.string(),
  species: z.array(RRef).default([]),
  subspecies: z.array(RRef).default([]),
});

const RBackground = z.looseObject({
  index: z.string(),
  name: z.string(),
  ability_scores: z.array(RRef),
  feat: z.looseObject({ index: z.string(), note: z.string().optional() }),
  proficiencies: z.array(RRef),
  equipment_options: z.array(RChoice),
});

const RDescribed = z.looseObject({ index: z.string(), name: z.string(), description: z.string() });
const RFeat = RDescribed.extend({ type: z.string() });
const RSkill = RDescribed.extend({ ability_score: RRef });

const RDamage = z.looseObject({ damage_dice: z.string(), damage_type: RRef });
const RCost = z.looseObject({ quantity: z.number(), unit: z.string() });
const REquipment = z.looseObject({
  index: z.string(),
  name: z.string(),
  equipment_categories: z.array(RRef),
  cost: RCost.optional(),
  weight: z.number().optional(),
  damage: RDamage.optional(),
  two_handed_damage: RDamage.optional(),
  properties: z.array(RRef).optional(),
  mastery: RRef.optional(),
  range: z.looseObject({ normal: z.number(), long: z.number().optional() }).optional(),
  throw_range: z.looseObject({ normal: z.number(), long: z.number().optional() }).optional(),
  ammunition: RRef.optional(),
  armor_class: z.looseObject({ base: z.number(), dex_bonus: z.boolean(), max_bonus: z.number().optional() }).optional(),
  str_minimum: z.number().optional(),
  stealth_disadvantage: z.boolean().optional(),
  contents: z.array(z.looseObject({ item: RRef, quantity: z.number() })).optional(),
});

// --- corrections ----------------------------------------------------------

/**
 * Where the source disagrees with the SRD 5.2 itself. Each one names what the
 * SRD says; src/srd.test.ts pins them. Report them upstream, and delete an
 * entry once the source is fixed (the importer refuses a correction that no
 * longer changes anything, so stale ones can't linger).
 */
const CORRECTIONS = {
  /** SRD 5.2 armor table: Hide Armor is Medium Armor (12 + Dex, max 2). The source tags it light-armor. */
  armorCategory: { "hide-armor": "medium" } as Record<string, "light" | "medium" | "heavy">,
  /** SRD 5.2 Human: "Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species." The source has Medium only. */
  speciesSizes: { human: ["Medium", "Small"] } as Record<string, string[]>,
};

// --- shaping --------------------------------------------------------------

/** "Strength or Dexterity" arrives as a pick; "Dexterity and Wisdom" as a list. */
function primaryAbility(raw: z.infer<typeof RClass>["primary_ability"]) {
  const options = z
    .looseObject({ ability_score_options: z.looseObject({ from: z.looseObject({ options: z.array(z.looseObject({ item: RRef })) }) }) })
    .safeParse(raw);
  if (options.success) {
    return { description: raw.desc, abilities: options.data.ability_score_options.from.options.map((o) => ability(o.item)), anyOf: true };
  }
  return { description: raw.desc, abilities: z.looseObject({ ability_scores: z.array(RRef) }).parse(raw).ability_scores.map(ability), anyOf: false };
}

function correctedSizes(index: string, sourced: string[]): string[] {
  const corrected = CORRECTIONS.speciesSizes[index];
  if (!corrected) return sourced;
  if (corrected.join() === sourced.join()) throw new Error(`stale correction: ${index} sizes are already ${sourced.join("/")}`);
  return corrected;
}

/**
 * A kit entry that names an equipment category rather than an item ("Holy
 * Symbol" for the Cleric) is really "one of your choice": turn it into a choice.
 */
function resolveKitCategories(k: Kit, items: Set<string>, categories: Map<string, string>, what: string): Kit {
  return {
    ...k,
    options: k.options.map((o) => {
      const choices = [...o.choices];
      const kept = o.items.filter((i) => {
        if (items.has(i.equipment)) return true;
        const name = categories.get(i.equipment);
        if (!name) throw new Error(`${what}: kit names "${i.equipment}", which is neither an item nor a category`);
        choices.push({ description: name, choose: i.count, categories: [{ index: i.equipment, name }] });
        return false;
      });
      return { ...o, items: kept, choices };
    }),
  };
}

/** Drop undefined fields so the generated data has no `undefined` in it. */
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function equipmentEntry(raw: z.infer<typeof REquipment>): Equipment {
  const cats = raw.equipment_categories.map((c) => c.index);
  const base = { index: raw.index, name: raw.name, cost: raw.cost, weight: raw.weight };
  if (raw.damage && cats.includes("weapons")) {
    const ranged = cats.includes("ranged-weapons");
    // For a melee weapon the source's `range` is its reach; only a thrown one has ranges to record.
    const reach = ranged ? raw.range : raw.throw_range;
    return clean({
      kind: "weapon" as const,
      ...base,
      category: cats.includes("martial-weapons") ? ("martial" as const) : ("simple" as const),
      range: ranged ? ("ranged" as const) : ("melee" as const),
      damage: { dice: raw.damage.damage_dice, type: raw.damage.damage_type.index },
      twoHandedDamage: raw.two_handed_damage
        ? { dice: raw.two_handed_damage.damage_dice, type: raw.two_handed_damage.damage_type.index }
        : undefined,
      properties: (raw.properties ?? []).map((p) => p.index),
      mastery: raw.mastery?.index,
      normalRange: reach?.normal,
      longRange: reach?.long,
      ammunition: raw.ammunition?.index,
    });
  }
  if (raw.armor_class && cats.includes("armor")) {
    const sourced = (["light", "medium", "heavy"] as const).find((c) => cats.includes(`${c}-armor`)) ?? (cats.includes("shields") || raw.index === "shield" ? "shield" : null);
    if (!sourced) throw new Error(`armor ${raw.index}: no category in ${cats.join(", ")}`);
    const category = CORRECTIONS.armorCategory[raw.index] ?? sourced;
    if (CORRECTIONS.armorCategory[raw.index] === sourced) throw new Error(`stale correction: ${raw.index} is already ${sourced}`);
    return clean({
      kind: "armor" as const,
      ...base,
      category,
      baseAc: raw.armor_class.base,
      dexBonus: raw.armor_class.dex_bonus,
      maxDexBonus: raw.armor_class.max_bonus,
      strMinimum: raw.str_minimum || undefined,
      stealthDisadvantage: raw.stealth_disadvantage ?? false,
    });
  }
  return clean({
    kind: "gear" as const,
    ...base,
    categories: cats,
    contents: raw.contents?.map((c) => ({ equipment: c.item.index, quantity: c.quantity })),
  });
}

// --- writing --------------------------------------------------------------

async function emit(file: string, name: string, type: string, schema: z.ZodType, data: unknown[]) {
  data.forEach((entry, i) => {
    const result = schema.safeParse(entry);
    if (!result.success) throw new Error(`${file}[${i}] doesn't match ${type}: ${result.error.message}`);
  });
  const body =
    `// Generated by packages/srd/scripts/import.ts from ${SRD_SOURCE.repo}@${SRD_SOURCE.commit.slice(0, 12)}.\n` +
    `// SRD 5.2 material, CC-BY-4.0: see packages/srd/NOTICE. Do not edit; re-run the import.\n` +
    `import type { ${type} } from "../schema.js";\n\n` +
    `export const ${name}: readonly ${type}[] = ${JSON.stringify(data, null, 2)};\n`;
  await writeFile(join(OUT, file), body);
  console.log(`${file}: ${data.length}`);
}

async function main() {
  const [classes, levels, features, species, subspecies, traits, backgrounds, feats, equipment, skills, conditions, weaponProperties, masteries, equipmentCategories] =
    await Promise.all(
      [
        "Classes",
        "Levels",
        "Features",
        "Species",
        "Subspecies",
        "Traits",
        "Backgrounds",
        "Feats",
        "Equipment",
        "Skills",
        "Conditions",
        "Weapon-Properties",
        "Weapon-Mastery-Properties",
        "Equipment-Categories",
      ].map(load),
    );

  const outEquipment = z.array(REquipment).parse(equipment).map(equipmentEntry);
  const itemIndexes = new Set(outEquipment.map((e) => e.index));
  const categoryNames = new Map(z.array(RRef).parse(equipmentCategories).map((c) => [c.index, c.name]));

  const rLevels = z.array(RLevel).parse(levels);
  const outClasses = z.array(RClass).parse(classes).map((c) => {
    const own = rLevels.filter((l) => l.class.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
    const sub = c.subclasses[0]!;
    return {
      index: c.index,
      name: c.name,
      hitDie: c.hit_die,
      primaryAbility: primaryAbility(c.primary_ability),
      savingThrows: c.saving_throws.map(ability),
      proficiencies: c.proficiencies.map((p) => ({ index: p.index, name: p.name })),
      proficiencyChoices: c.proficiency_choices.map((p) => ({
        description: p.desc,
        choose: p.choose,
        from: p.from.options.flatMap(flattenProf),
      })),
      startingKit: resolveKitCategories(kit(c.starting_equipment_options, c.index), itemIndexes, categoryNames, c.index),
      levels: own.map((l) => ({
        level: l.level,
        proficiencyBonus: l.prof_bonus ?? NaN,
        features: l.features.map((f) => f.index),
      })),
      subclass: {
        index: sub.index,
        name: sub.name,
        levels: rLevels
          .filter((l) => l.subclass?.index === sub.index)
          .sort((a, b) => a.level - b.level)
          .map((l) => ({ level: l.level, features: l.features.map((f) => f.index) })),
      },
    };
  });

  const outFeatures = z.array(RFeature).parse(features).map((f) => {
    const level = Number(f.level.index.split("-").pop());
    return clean({ index: f.index, name: f.name, class: f.class.index, subclass: f.subclass?.index, level, description: f.description });
  });

  const rTraits = z.array(RTrait).parse(traits);
  const rSubspecies = z.array(RSubspecies).parse(subspecies);
  const outSpecies = z.array(RSpecies).parse(species).map((s) => {
    // A species' own list misses some traits; the traits file says whom each belongs to.
    // Traits tied to a lineage belong to that lineage, not the whole species.
    const shared = rTraits.filter((t) => t.species.some((x) => x.index === s.index) && t.subspecies.length === 0).map((t) => t.index);
    return {
      index: s.index,
      name: s.name,
      creatureType: s.type,
      sizes: correctedSizes(s.index, s.size ? [s.size] : (s.size_options?.from.options ?? []).map((o) => o.size)),
      speed: s.speed,
      traits: [...new Set([...s.traits.map((t) => t.index), ...shared])],
      lineages: rSubspecies
        .filter((l) => l.species.index === s.index)
        .map((l) => clean({ index: l.index, name: l.name, damageType: l.damage_type?.index, traits: l.traits.map((t) => t.index) })),
    };
  });
  const outTraits = rTraits.map((t) => ({ index: t.index, name: t.name, description: t.description }));

  const outBackgrounds = z.array(RBackground).parse(backgrounds).map((b) => ({
    index: b.index,
    name: b.name,
    abilityScores: b.ability_scores.map(ability),
    feat: clean({ index: b.feat.index, note: b.feat.note }),
    skills: b.proficiencies.filter((p) => p.index.startsWith("skill-")).map((p) => p.index.slice("skill-".length)),
    tools: b.proficiencies.filter((p) => !p.index.startsWith("skill-")).map((p) => ({ index: p.index, name: p.name })),
    startingKit: resolveKitCategories(kit(b.equipment_options, b.index), itemIndexes, categoryNames, b.index),
  }));

  // Every reference must land on something we emit.
  const outFeats = z.array(RFeat).parse(feats).map((f) => ({ index: f.index, name: f.name, type: f.type, description: f.description }));
  const featureIdx = new Set(outFeatures.map((f) => f.index));
  const traitIdx = new Set(outTraits.map((t) => t.index));
  const featIdx = new Set(outFeats.map((f) => f.index));
  const missing = [
    ...outClasses.flatMap((c) => [...c.levels, ...c.subclass.levels].flatMap((l) => l.features.filter((f) => !featureIdx.has(f)).map((f) => `${c.index} feature ${f}`))),
    ...outSpecies.flatMap((s) => [...s.traits, ...s.lineages.flatMap((l) => l.traits)].filter((t) => !traitIdx.has(t)).map((t) => `${s.index} trait ${t}`)),
    ...outBackgrounds.filter((b) => !featIdx.has(b.feat.index)).map((b) => `${b.index} feat ${b.feat.index}`),
    ...outEquipment.flatMap((e) => (e.kind === "gear" ? (e.contents ?? []).filter((c) => !itemIndexes.has(c.equipment)).map((c) => `${e.index} contains ${c.equipment}`) : [])),
  ];
  if (missing.length) throw new Error(`dangling references:\n${missing.join("\n")}`);

  const described = (raw: unknown) => z.array(RDescribed).parse(raw).map((r) => ({ index: r.index, name: r.name, description: r.description }));

  await emit("classes.ts", "classes", "SrdClass", SrdClass, outClasses);
  await emit("features.ts", "features", "Feature", Feature, outFeatures);
  await emit("species.ts", "species", "Species", Species, outSpecies);
  await emit("species-traits.ts", "speciesTraits", "SpeciesTrait", SpeciesTrait, outTraits);
  await emit("backgrounds.ts", "backgrounds", "Background", Background, outBackgrounds);
  await emit("feats.ts", "feats", "Feat", Feat, outFeats);
  await emit("equipment.ts", "equipment", "Equipment", Equipment, outEquipment);
  await emit(
    "skills.ts",
    "skills",
    "Skill",
    Skill,
    z.array(RSkill).parse(skills).map((s) => ({ index: s.index, name: s.name, ability: ability(s.ability_score), description: s.description })),
  );
  await emit("conditions.ts", "conditions", "Rule", Rule, described(conditions));
  await emit("weapon-properties.ts", "weaponProperties", "Rule", Rule, described(weaponProperties));
  await emit("weapon-masteries.ts", "weaponMasteries", "Rule", Rule, described(masteries));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
