import { backgrounds, getBackground, species } from "@bardcast/srd";
import { z } from "zod";
import { AtUri, Did, IsoDateTime } from "./ids.js";
import { AbilityScores, SRD_CLASS_INDEXES, STANDARD_ARRAY } from "./sheet.js";
import { ABILITY_SCORES, PERSONALITY_TRAITS, UNCLEAR_TRAIT_VALUE, type AbilityScore, type PersonalityTrait } from "./traits.js";

/**
 * Session zero: the narrator talks with a player, one voice prompt at a time,
 * until their answers settle who the character is (docs/character-creation.md,
 * "Session zero, out loud"). This module is the pure half: what can be
 * settled, when an attribute counts as settled, and what to ask next. The
 * orchestrator's use-cases/creation.ts does the talking.
 *
 * The decision model (Clef) only ever reads; code here decides what it means.
 * Nothing is set without the player: Clef settles only what the player's own
 * words clearly say, and the player picks everything else.
 */

/** Probability the top option needs before an attribute counts as settled. Tune against real answers. */
export const SETTLE_AT = 0.65;
/** How far the top option must lead the runner-up. */
export const SETTLE_MARGIN = 0.3;
/** Replies on one attribute before the narrator names the top two and the player picks. */
export const MAX_TURNS = 3;
/** Personality traits a character needs; the rest of the axes are asked about only if they come up. */
export const MIN_PERSONALITY_TRAITS = 3;

/** The first prompt: a big question, read against every attribute like any other reply. */
export const OPENER_QUESTION = "Who are you when nobody's watching?";
/** Asked straight out; the name is read back to the player, never inferred. */
export const NAME_QUESTION = "And what do people call you?";

export const REQUIRED_ATTRIBUTES = ["species", "class", "background"] as const;
/** The required attributes, then the personality axes in traits.ts's order (a test holds them in step). */
export const CREATION_ATTRIBUTES = [
  ...REQUIRED_ATTRIBUTES,
  "temperament",
  "disposition",
  "morality",
  "approach",
  "under_pressure",
  "speech",
  "loyalty",
  "curiosity",
] as const satisfies ReadonlyArray<(typeof REQUIRED_ATTRIBUTES)[number] | PersonalityTrait>;
export const CreationAttribute = z.enum(CREATION_ATTRIBUTES);
export type CreationAttribute = z.infer<typeof CreationAttribute>;

/**
 * What each SRD class is, for the decision model. Our words, not the SRD's:
 * the SRD has rules text, not a one-line sense of who plays one.
 */
const CLASS_MEANINGS: Record<(typeof SRD_CLASS_INDEXES)[number], string> = {
  barbarian: "Barbarian: a fierce warrior driven by rage and instinct",
  bard: "Bard: a performer whose words and music work magic",
  cleric: "Cleric: a servant of a god who wields divine power",
  druid: "Druid: a keeper of the wild who draws on nature's magic",
  fighter: "Fighter: a trained soldier or duelist, master of weapons and armor",
  monk: "Monk: a disciplined martial artist who channels inner energy",
  paladin: "Paladin: a holy warrior bound by a sacred oath to judge and protect",
  ranger: "Ranger: a hunter and tracker of the wilds who finds what's lost",
  rogue: "Rogue: a sneak, thief or trickster who strikes from the shadows",
  sorcerer: "Sorcerer: someone born with magic in their blood",
  warlock: "Warlock: someone who made a pact with a powerful otherworldly patron",
  wizard: "Wizard: a scholar who learned magic through study and spellbooks",
};

const BACKGROUND_MEANINGS: Record<string, string> = {
  acolyte: "Acolyte: raised in service to a temple",
  criminal: "Criminal: lived by theft, smuggling or worse",
  sage: "Sage: spent years in libraries and study",
  soldier: "Soldier: trained and fought in an army",
};

/** Options (key → meaning) the decision model picks among for an attribute. `unclear` is not one of them. */
export function attributeOptions(attribute: CreationAttribute): Record<string, string> {
  switch (attribute) {
    case "class":
      return { ...CLASS_MEANINGS };
    case "species":
      return Object.fromEntries(species.map((s) => [s.index, `${s.name} (${s.creatureType.toLowerCase()})`]));
    case "background":
      return Object.fromEntries(backgrounds.map((b) => [b.index, BACKGROUND_MEANINGS[b.index] ?? b.name]));
    default:
      return { ...PERSONALITY_TRAITS[attribute].values };
  }
}

/** The question the decision model answers about an attribute. */
export function attributeQuestion(attribute: CreationAttribute): string {
  switch (attribute) {
    case "class":
      return "Which kind of adventurer is this character?";
    case "species":
      return "What species is this character?";
    case "background":
      return "What did this character do before adventuring?";
    default:
      return PERSONALITY_TRAITS[attribute].question;
  }
}

/** A short spoken name for an option ("Paladin", "Acts first, relishes risk…"). */
export function optionLabel(attribute: CreationAttribute, option: string): string {
  const meaning = attributeOptions(attribute)[option];
  if (!meaning) return option;
  const colon = meaning.indexOf(":");
  if (colon !== -1) return meaning.slice(0, colon);
  const paren = meaning.indexOf(" (");
  return paren !== -1 ? meaning.slice(0, paren) : meaning.toLowerCase();
}

export function isPersonality(attribute: CreationAttribute): attribute is PersonalityTrait {
  return attribute in PERSONALITY_TRAITS;
}

/** Probabilities over one attribute's options, `unclear` included. */
export type Reading = Record<string, number>;

/** The two likeliest real options, best first. */
export function leaders(reading: Reading): [string, string] | null {
  const ranked = Object.entries(reading)
    .filter(([k]) => k !== UNCLEAR_TRAIT_VALUE)
    .sort((a, b) => b[1] - a[1]);
  return ranked.length >= 2 ? [ranked[0]![0], ranked[1]![0]] : null;
}

/** The top real option's probability: how close the attribute is to settled. */
export function strength(reading: Reading | undefined): number {
  if (!reading) return 0;
  const real = Object.entries(reading).filter(([k]) => k !== UNCLEAR_TRAIT_VALUE);
  return real.length ? Math.max(...real.map(([, p]) => p)) : 0;
}

/**
 * Whether a reading settles its attribute: the top option is a real one, has
 * at least SETTLE_AT, and leads everything else (`unclear` included) by
 * SETTLE_MARGIN.
 */
export function settles(reading: Reading): { value: string; confidence: number } | null {
  const ranked = Object.entries(reading).sort((a, b) => b[1] - a[1]);
  const [top, next] = ranked;
  if (!top || top[0] === UNCLEAR_TRAIT_VALUE) return null;
  if (top[1] < SETTLE_AT || top[1] - (next?.[1] ?? 0) < SETTLE_MARGIN) return null;
  return { value: top[0], confidence: top[1] };
}

/** One narrator prompt and the player's answer. */
export const CreationTurn = z.object({
  /** opener: the big question. name: asked straight. ask: a follow-up. choose: the player picks between two. */
  kind: z.enum(["opener", "name", "ask", "choose"]),
  /** The attribute an `ask` or `choose` turn is about. */
  attribute: CreationAttribute.optional(),
  /** The two options the turn is trying to tell apart. */
  candidates: z.array(z.string().max(60)).max(2).optional(),
  /** What the narrator said. */
  question: z.string().min(1).max(1000),
  /** The Antiphony prompt in the player's space. */
  prompt: z.object({ uri: AtUri, cid: z.string().min(1).max(200) }),
  askedAt: IsoDateTime,
  reply: z
    .object({
      /** The Antiphony reply. Absent when the player typed instead of speaking. */
      uri: AtUri.optional(),
      /** Absent until Antiphony has transcribed it. */
      transcript: z.string().max(10000).optional(),
      at: IsoDateTime,
    })
    .optional(),
  /** Clef's reading of every open attribute after this reply, by attribute. */
  reading: z.record(z.string(), z.record(z.string(), z.number().min(0).max(1))).optional(),
});
export type CreationTurn = z.infer<typeof CreationTurn>;

export const SettledAttribute = z.object({
  value: z.string().max(60),
  /** clef: the player's answers clearly said it. player: the player picked it. */
  by: z.enum(["clef", "player"]),
  confidence: z.number().min(0).max(1).optional(),
  at: IsoDateTime,
});
export type SettledAttribute = z.infer<typeof SettledAttribute>;

/** The front of the reveal card, written from the whole conversation. */
export const CharacterCard = z.object({
  concept: z.string().min(1).max(300),
  quirks: z.array(z.string().min(1).max(200)).min(1).max(3),
  drives: z.array(z.string().min(1).max(200)).min(1).max(3),
  /** The player's own words, from one of their answers. */
  quote: z.string().min(1).max(300),
});
export type CharacterCard = z.infer<typeof CharacterCard>;

/**
 * A character being made. App state, never a record: what reaches the
 * player's repo is the profile and sheet `confirmCharacter` writes. Kept after
 * every turn, so creation can take as long as the player takes.
 */
export const Creation = z.object({
  player: Did,
  /** talking: the conversation is going. ready: everything is settled; the card can be written. confirmed: saved as a character. */
  status: z.enum(["talking", "ready", "confirmed"]),
  turns: z.array(CreationTurn).max(200),
  settled: z.partialRecord(CreationAttribute, SettledAttribute),
  name: z
    .object({
      /** What the player said when asked. */
      heard: z.string().max(200).optional(),
      /** The name the player confirmed. */
      confirmed: z.string().min(1).max(120).optional(),
    })
    .default({}),
  card: CharacterCard.optional(),
  /** Clef's suggested placement of the standard array. The player places the scores. */
  suggestedAbilities: AbilityScores.optional(),
  /** The character's id once confirmed. */
  character: z.string().max(128).optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Creation = z.infer<typeof Creation>;

/** What the narrator does next. */
export type CreationStep =
  | { kind: "opener" }
  | { kind: "name" }
  | { kind: "ask"; attribute: CreationAttribute; candidates: [string, string] }
  | { kind: "choose"; attribute: CreationAttribute; candidates: [string, string] }
  /** The last prompt hasn't been answered, or the answer isn't transcribed or read yet. */
  | { kind: "wait" }
  /** Asked to pick and didn't say clearly; waiting on the player's pick. */
  | { kind: "pick"; attribute: CreationAttribute; candidates: [string, string] }
  | { kind: "done" };

/** Personality traits settled so far. */
export function settledPersonality(creation: Pick<Creation, "settled">): number {
  return Object.keys(creation.settled).filter((a) => isPersonality(a as CreationAttribute)).length;
}

/** The attributes still worth asking about. */
export function openAttributes(creation: Pick<Creation, "settled">): CreationAttribute[] {
  const required = REQUIRED_ATTRIBUTES.filter((a) => !creation.settled[a]);
  if (required.length) return required;
  if (settledPersonality(creation) >= MIN_PERSONALITY_TRAITS) return [];
  return CREATION_ATTRIBUTES.filter((a) => isPersonality(a) && !creation.settled[a]);
}

/** Every attribute that could still be settled: what the decision model reads each turn. */
export function unsettledAttributes(creation: Pick<Creation, "settled">): CreationAttribute[] {
  return CREATION_ATTRIBUTES.filter((a) => !creation.settled[a]);
}

/** The latest reading of an attribute. */
export function latestReading(creation: Pick<Creation, "turns">, attribute: CreationAttribute): Reading | undefined {
  for (let i = creation.turns.length - 1; i >= 0; i--) {
    const reading = creation.turns[i]!.reading?.[attribute];
    if (reading) return reading;
  }
  return undefined;
}

/** Replies so far on an attribute's own turns. */
export function turnsOn(creation: Pick<Creation, "turns">, attribute: CreationAttribute): number {
  return creation.turns.filter((t) => t.attribute === attribute && t.reply).length;
}

/** The top two to ask about. With no reading yet, the first two options. */
function candidatesFor(creation: Pick<Creation, "turns">, attribute: CreationAttribute): [string, string] {
  const reading = latestReading(creation, attribute);
  const top = reading ? leaders(reading) : null;
  if (top) return top;
  const keys = Object.keys(attributeOptions(attribute));
  return [keys[0]!, keys[1]!];
}

/**
 * What to ask next. The narrator stays on an attribute until it's settled or
 * has had MAX_TURNS replies, then the player picks. The next attribute is the
 * least-settled required one (species, class, background); once those are
 * settled, the personality axis closest to settling, since only a few are
 * needed and the rest stay unasked.
 */
export function nextStep(creation: Pick<Creation, "turns" | "settled" | "name">): CreationStep {
  const last = creation.turns.at(-1);
  if (!last) return { kind: "opener" };
  // A prompt is done with once its answer is read, or once the player settled
  // what it asked some other way (tapped a pick, typed the name).
  const answered =
    (last.reply && last.reading) ||
    (last.attribute && creation.settled[last.attribute]) ||
    (last.kind === "name" && creation.name.confirmed);
  if (!answered) return { kind: "wait" };
  if (!creation.turns.some((t) => t.kind === "name")) return { kind: "name" };

  if (last.attribute && !creation.settled[last.attribute]) {
    const candidates = candidatesFor(creation, last.attribute);
    if (last.kind === "choose") return { kind: "pick", attribute: last.attribute, candidates };
    if (turnsOn(creation, last.attribute) < MAX_TURNS) return { kind: "ask", attribute: last.attribute, candidates };
    return { kind: "choose", attribute: last.attribute, candidates };
  }

  const open = openAttributes(creation);
  if (!open.length) return { kind: "done" };
  const personality = isPersonality(open[0]!);
  const ranked = [...open].sort((a, b) => {
    const diff = strength(latestReading(creation, a)) - strength(latestReading(creation, b));
    return personality ? -diff : diff;
  });
  const attribute = ranked[0]!;
  const candidates = candidatesFor(creation, attribute);
  return turnsOn(creation, attribute) < MAX_TURNS
    ? { kind: "ask", attribute, candidates }
    : { kind: "choose", attribute, candidates };
}

/** The narrator's line when the player picks: the top two, by name. */
export function chooseQuestion(attribute: CreationAttribute, [a, b]: [string, string]): string {
  if (isPersonality(attribute)) {
    return `I can't quite tell. Which is closer: ${optionLabel(attribute, a)}, or ${optionLabel(attribute, b)}?`;
  }
  return `Sounds like ${article(optionLabel(attribute, a))}, or maybe ${article(optionLabel(attribute, b))}. Which is it?`;
}

function article(label: string): string {
  return `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label.toLowerCase()}`;
}

/** The player's answers, in order: the only place a card's quote can come from. */
export function playerWords(creation: Pick<Creation, "turns">): string[] {
  return creation.turns.flatMap((t) => (t.reply?.transcript?.trim() ? [t.reply.transcript.trim()] : []));
}

/** The quote is the player's own words: it must appear in one of their answers. */
export function isPlayerQuote(creation: Pick<Creation, "turns">, quote: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const q = norm(quote);
  return q.length > 0 && playerWords(creation).some((w) => norm(w).includes(q));
}

/**
 * A quote the card can always fall back on: the longest sentence the player
 * said, up to 300 characters. Used when a written quote isn't their own words.
 */
export function playerQuoteFrom(answers: string[]): string {
  const sentences = answers
    .flatMap((a) => a.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 300);
  return sentences.sort((a, b) => b.length - a.length)[0] ?? "…";
}

/**
 * Clef's suggested placement: the standard array in order of how much the
 * character leans on each ability. Ties keep the order of ABILITY_SCORES. A
 * suggestion only; the player places the scores.
 */
export function placeStandardArray(leanings: Partial<Record<AbilityScore, number>>): AbilityScores {
  const ranked = [...ABILITY_SCORES].sort((a, b) => (leanings[b] ?? 0) - (leanings[a] ?? 0));
  return Object.fromEntries(ranked.map((ability, i) => [ability, STANDARD_ARRAY[i]!])) as AbilityScores;
}

/** Whether scores are the standard array, each value used once. */
export function isStandardArray(scores: AbilityScores): boolean {
  const placed = ABILITY_SCORES.map((a) => scores[a]).sort((x, y) => y - x);
  return placed.every((v, i) => v === STANDARD_ARRAY[i]);
}

/** A background's ability increases: +2 and +1, or +1 to all three of its abilities (SRD 5.2). */
export const BackgroundIncreases = z.partialRecord(z.enum(ABILITY_SCORES), z.number().int().min(1).max(2));
export type BackgroundIncreases = z.infer<typeof BackgroundIncreases>;

/** Apply a background's increases to placed scores. Throws if they aren't a valid pick for that background. */
export function applyBackgroundIncreases(
  scores: AbilityScores,
  background: string,
  increases: BackgroundIncreases,
): AbilityScores {
  const bg = getBackground(background);
  if (!bg) throw new RangeError(`no SRD background ${background}`);
  const picked = Object.entries(increases) as Array<[AbilityScore, number]>;
  if (picked.some(([a]) => !bg.abilityScores.includes(a))) {
    throw new RangeError(`${bg.name} can raise only ${bg.abilityScores.join(", ")}`);
  }
  const amounts = picked.map(([, n]) => n).sort().join(",");
  if (amounts !== "1,2" && amounts !== "1,1,1") {
    throw new RangeError("a background gives +2 and +1, or +1 to all three of its abilities");
  }
  const raised = { ...scores };
  for (const [a, n] of picked) raised[a] = Math.min(20, raised[a] + n);
  return raised;
}
