/**
 * The closed trait vocabulary.
 *
 * `Trait.name`/`value` are free strings on the wire, but inferred traits come
 * from a decision model that can only pick among options we list. So the
 * personality axes and their values live here, in one place, and inference
 * writes `Trait { name: axis, value: option, confidence }`.
 *
 * Ability scores are a second, separate list. They live on the sheet's 5e
 * backbone (sheet.ts), never as traits, so those names are reserved:
 * inference never writes them, and they are set by the DM or the sheet's
 * mechanics, not guessed from how a player talks. Character creation may
 * suggest a placement, but the player confirms every score
 * (docs/character-creation.md).
 */

/** 5e ability scores. Traits with these names carry a numeric score (1–20). */
export const ABILITY_SCORES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;
export type AbilityScore = (typeof ABILITY_SCORES)[number];

export function isAbilityScore(name: string): boolean {
  return (ABILITY_SCORES as readonly string[]).includes(name.toLowerCase());
}

/**
 * The option every personality axis carries for "the replies don't show this".
 * An inference that lands here records nothing.
 */
export const UNCLEAR_TRAIT_VALUE = "unclear";

export interface PersonalityAxis {
  /** Asked of the decision model, about the character speaking in the replies. */
  question: string;
  /** Option key → what it means. `unclear` is added for every axis. */
  values: Record<string, string>;
}

/** Personality axes inferred from reply transcripts. Keys are `Trait.name`. */
export const PERSONALITY_TRAITS = {
  temperament: {
    question: "What is this character's usual temperament?",
    values: {
      bold: "Acts first, relishes risk, rarely hesitates",
      cautious: "Weighs options, avoids unnecessary risk",
      volatile: "Swings between moods, quick to flare up",
      steady: "Even-keeled, hard to rattle",
    },
  },
  disposition: {
    question: "How does this character treat other people?",
    values: {
      warm: "Open, kind, quick to trust",
      guarded: "Polite but keeps others at a distance",
      prickly: "Sharp, suspicious, easily offended",
      charming: "Wins people over, sometimes for their own ends",
    },
  },
  morality: {
    question: "What guides this character's choices when right and wrong are at stake?",
    values: {
      principled: "Holds to a code even when it costs them",
      pragmatic: "Does what works, bends rules when needed",
      self_serving: "Looks out for themselves first",
      merciful: "Leans toward forgiveness and second chances",
    },
  },
  approach: {
    question: "How does this character usually solve problems?",
    values: {
      cunning: "Tricks, schemes, and misdirection",
      forthright: "Direct action and plain talk",
      scholarly: "Study, lore, and careful reasoning",
      instinctive: "Gut feeling and improvisation",
    },
  },
  under_pressure: {
    question: "How does this character react when things go badly?",
    values: {
      rallies: "Steps up and steadies others",
      freezes: "Hesitates or locks up",
      retreats: "Pulls back to safety",
      lashes_out: "Gets angry or reckless",
    },
  },
  speech: {
    question: "How does this character talk?",
    values: {
      terse: "Few words, to the point",
      florid: "Elaborate, poetic, or grand",
      wry: "Jokes, irony, and asides",
      formal: "Courteous, measured, proper",
    },
  },
  loyalty: {
    question: "Where does this character's loyalty lie first?",
    values: {
      companions: "The party and friends at their side",
      cause: "An ideal, faith, or quest",
      self: "Their own interests",
      liege: "A lord, order, or employer",
    },
  },
  curiosity: {
    question: "How does this character respond to the unknown?",
    values: {
      eager: "Seeks it out, wants to know more",
      wary: "Approaches carefully, expects danger",
      dismissive: "Uninterested, sticks to what they know",
      reverent: "Treats mystery with awe or superstition",
    },
  },
} as const satisfies Record<string, PersonalityAxis>;

export type PersonalityTrait = keyof typeof PERSONALITY_TRAITS;
