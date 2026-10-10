import { z } from "zod";
import type { PlayedSheet } from "./sheet.js";
import type { AbilityScore } from "./traits.js";
import { deriveSeed, makeRng, rollD20 } from "./dice.js";

/**
 * Action resolution on the D&D SRD 5.2 (CC-BY-4.0): a d20 ability check + the
 * character's modifier vs a Difficulty Class. This is where the loop closes —
 * *player replies → character sheet → dice modifier → outcome* (docs/story-engine.md §3).
 */

/** SRD typical Difficulty Classes. */
export const DC = {
  veryEasy: 5,
  easy: 10,
  medium: 15,
  hard: 20,
  veryHard: 25,
  nearlyImpossible: 30,
} as const;

export const Outcome = z.enum(["critical-success", "success", "failure", "critical-failure"]);
export type Outcome = z.infer<typeof Outcome>;

export type RollMode = "normal" | "advantage" | "disadvantage";

/** A persisted roll, kept in the chapter's roll log for reproducibility. */
export const RollLogEntry = z.object({
  /** What was attempted, e.g. "elara: disarm the trap". */
  label: z.string().max(300),
  /** The sheet trait that supplied the modifier, if any. */
  ability: z.string().max(80).optional(),
  dc: z.number().int(),
  mode: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
  /** The raw d20 face(s) rolled (two when advantage/disadvantage). */
  d20s: z.array(z.number().int().min(1).max(20)).min(1).max(2),
  /** The d20 actually used after advantage/disadvantage. */
  d20: z.number().int().min(1).max(20),
  modifier: z.number().int(),
  total: z.number().int(),
  outcome: Outcome,
  seed: z.number().int(),
});
export type RollLogEntry = z.infer<typeof RollLogEntry>;

/** 5e ability-score → modifier: floor((score - 10) / 2). */
export function abilityScoreModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * The check modifier for an ability, from the sheet as played at the table
 * (playSheet / playSeat). No sheet yet → 0. (The narrative engine decides
 * which ability a given action keys off of.)
 */
export function modifierFor(played: Pick<PlayedSheet, "abilities"> | null | undefined, ability: AbilityScore): number {
  return played ? abilityScoreModifier(played.abilities[ability]) : 0;
}

export interface AbilityCheckInput {
  /** Labelled sub-seed source: the master seed + a unique beat/action label. */
  masterSeed: number;
  label: string;
  dc: number;
  modifier: number;
  mode?: RollMode;
  ability?: string;
}

/**
 * Resolve a single ability check deterministically from the master seed + label.
 * Nat 20 → critical-success, nat 1 → critical-failure, else success iff total ≥ DC.
 */
export function abilityCheck(input: AbilityCheckInput): RollLogEntry {
  const mode: RollMode = input.mode ?? "normal";
  const seed = deriveSeed(input.masterSeed, input.label);
  const rng = makeRng(seed);

  const first = rollD20(rng);
  const d20s = mode === "normal" ? [first] : [first, rollD20(rng)];
  const d20 =
    mode === "advantage"
      ? Math.max(...d20s)
      : mode === "disadvantage"
        ? Math.min(...d20s)
        : first;

  const total = d20 + input.modifier;
  const outcome: Outcome =
    d20 === 20
      ? "critical-success"
      : d20 === 1
        ? "critical-failure"
        : total >= input.dc
          ? "success"
          : "failure";

  return {
    label: input.label,
    ...(input.ability !== undefined ? { ability: input.ability } : {}),
    dc: input.dc,
    mode,
    d20s,
    d20,
    modifier: input.modifier,
    total,
    outcome,
    seed,
  };
}

/** True for outcomes that should usually become a setback rather than a win. */
export function isFailure(outcome: Outcome): boolean {
  return outcome === "failure" || outcome === "critical-failure";
}
