import {
  PERSONALITY_TRAITS,
  UNCLEAR_TRAIT_VALUE,
  isAbilityScore,
  type CharacterProfile,
  type PersonalityTrait,
  type Trait,
} from "@bardcast/domain";
import type { ChoiceQuestion, DecisionModel } from "../ports/decision-model.js";

export interface InferTraitsInput {
  profile: CharacterProfile | null;
  /** This batch's reply transcripts, in the player's own words. */
  transcripts: string[];
}

/**
 * Infer personality traits from reply transcripts: one `choice` question per
 * axis in the closed vocabulary, all in a single decision-model call. The
 * model's calibrated confidence becomes `Trait.confidence` (0–100), which is
 * what the readiness gate counts. Axes the replies don't show (`unclear`) are
 * left out.
 */
export async function inferTraits(model: DecisionModel, input: InferTraitsInput): Promise<Trait[]> {
  const transcripts = input.transcripts.map((t) => t.trim()).filter(Boolean);
  if (transcripts.length === 0) return [];

  const name = input.profile?.displayName ?? "the character";
  const questions = {} as Record<PersonalityTrait, ChoiceQuestion>;
  for (const axis of Object.keys(PERSONALITY_TRAITS) as PersonalityTrait[]) {
    const def = PERSONALITY_TRAITS[axis];
    questions[axis] = {
      type: "choice",
      instructions: `The replies are spoken in character as ${name}. ${def.question} Answer "${UNCLEAR_TRAIT_VALUE}" if the replies don't show it.`,
      criteria: { ...def.values, [UNCLEAR_TRAIT_VALUE]: "The replies don't reveal this" },
    };
  }

  const answers = await model.decide({
    state: {
      character: name,
      ...(input.profile?.concept ? { concept: input.profile.concept } : {}),
      replies: transcripts,
    },
    questions,
  });

  const traits: Trait[] = [];
  for (const axis of Object.keys(questions) as PersonalityTrait[]) {
    const answer = answers[axis];
    if (!answer || answer.choice === UNCLEAR_TRAIT_VALUE) continue;
    if (!(answer.choice in PERSONALITY_TRAITS[axis].values)) continue;
    traits.push({
      name: axis,
      value: answer.choice,
      confidence: Math.round(Math.min(1, Math.max(0, answer.confidence)) * 100),
    });
  }
  return traits;
}

/**
 * Fold freshly inferred traits into a sheet's existing ones. Per trait name the
 * higher-confidence reading wins (a tie keeps the existing one), so one thin
 * batch of replies can't knock down a well-supported trait. Ability scores are
 * never touched by inference.
 */
export function mergeTraits(existing: Trait[], inferred: Trait[]): Trait[] {
  const merged = [...existing];
  for (const next of inferred) {
    if (isAbilityScore(next.name)) continue;
    const i = merged.findIndex((t) => t.name === next.name);
    if (i === -1) {
      merged.push(next);
    } else if ((next.confidence ?? 0) > (merged[i]!.confidence ?? 0)) {
      merged[i] = next;
    }
  }
  return merged;
}
