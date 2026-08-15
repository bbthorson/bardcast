import { z } from "zod";
import type { BehaviorModel, CharacterSheet } from "./character.js";
import type { VoiceProfile } from "./voice.js";

/**
 * The readiness gate.
 *
 * The DM is told "the audio is processing" only once the party has enough
 * signal to generate a believable chapter. "Enough" spans three axes that the
 * prompt replies feed: a character SHEET, a BEHAVIOR model, and a VOICE clone.
 *
 * This is a PURE function over the current state — no I/O — so it can run in the
 * orchestrator, in either client for live progress UI, and in tests. Thresholds
 * live in one place (`DEFAULT_THRESHOLDS`) and are overridable per campaign.
 */

export const ReadinessThresholds = z.object({
  /** Min number of traits with confidence ≥ minTraitConfidence. */
  minConfidentTraits: z.number().int().min(0).default(5),
  minTraitConfidence: z.number().int().min(0).max(100).default(60),
  /** Min exemplars (or a trained modelRef) before behavior counts as ready. */
  minBehaviorExemplars: z.number().int().min(0).default(8),
  /** Voice must be ready + consented. */
  requireVoice: z.boolean().default(true),
});
export type ReadinessThresholds = z.infer<typeof ReadinessThresholds>;

export const DEFAULT_THRESHOLDS: ReadinessThresholds = ReadinessThresholds.parse({});

/** Per-axis result, so a UI can show exactly what's still missing. */
export interface AxisStatus {
  ready: boolean;
  /** 0..1 progress toward this axis being ready. */
  progress: number;
  detail: string;
}

export interface CharacterReadiness {
  ready: boolean;
  sheet: AxisStatus;
  behavior: AxisStatus;
  voice: AxisStatus;
  /** What to prompt for next to close the biggest gap. */
  nextFocus: "sheet" | "behavior" | "voice" | null;
}

export interface CharacterSignal {
  sheet?: CharacterSheet | undefined;
  behavior?: BehaviorModel | undefined;
  voice?: VoiceProfile | undefined;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function evaluateCharacter(
  signal: CharacterSignal,
  thresholds: ReadinessThresholds = DEFAULT_THRESHOLDS,
): CharacterReadiness {
  const confidentTraits = (signal.sheet?.traits ?? []).filter(
    (t) => (t.confidence ?? 0) >= thresholds.minTraitConfidence,
  ).length;
  const sheet: AxisStatus = {
    ready: confidentTraits >= thresholds.minConfidentTraits,
    progress:
      thresholds.minConfidentTraits === 0
        ? 1
        : clamp01(confidentTraits / thresholds.minConfidentTraits),
    detail: `${confidentTraits}/${thresholds.minConfidentTraits} confident traits`,
  };

  const exemplars = signal.behavior?.exemplars.length ?? 0;
  const hasTrainedModel = Boolean(signal.behavior?.modelRef);
  const behavior: AxisStatus = {
    ready: hasTrainedModel || exemplars >= thresholds.minBehaviorExemplars,
    progress: hasTrainedModel
      ? 1
      : thresholds.minBehaviorExemplars === 0
        ? 1
        : clamp01(exemplars / thresholds.minBehaviorExemplars),
    detail: hasTrainedModel
      ? "behavior model trained"
      : `${exemplars}/${thresholds.minBehaviorExemplars} behavior exemplars`,
  };

  const voiceReady = (signal.voice?.status === "ivc" || signal.voice?.status === "pvc") && signal.voice?.consent === true;
  const voice: AxisStatus = {
    ready: !thresholds.requireVoice || voiceReady,
    progress: voiceReady ? 1 : 0,
    detail: thresholds.requireVoice
      ? voiceReady
        ? `voice clone active (${signal.voice?.status})`
        : `voice ${signal.voice?.status ?? "missing"}${signal.voice && !signal.voice?.consent ? " (no consent)" : ""}`
      : "voice not required",
  };

  const axes = [
    ["sheet", sheet],
    ["behavior", behavior],
    ["voice", voice],
  ] as const;
  const weakest = axes
    .filter(([, a]) => !a.ready)
    .sort(([, a], [, b]) => a.progress - b.progress)[0];

  return {
    ready: sheet.ready && behavior.ready && voice.ready,
    sheet,
    behavior,
    voice,
    nextFocus: weakest ? weakest[0] : null,
  };
}

export interface PartyReadiness {
  /** True when the campaign can generate its next chapter. */
  ready: boolean;
  perCharacter: Record<string, CharacterReadiness>;
  /** Characters not yet ready, with the axis to push on next. */
  blocking: Array<{ characterId: string; nextFocus: CharacterReadiness["nextFocus"] }>;
}

/**
 * Whole-party gate. The default policy: every character in the party must be
 * ready. (A future policy could allow generating with a subset; kept simple
 * here so the seam is obvious.)
 */
export function evaluateParty(
  party: Record<string, CharacterSignal>,
  thresholds: ReadinessThresholds = DEFAULT_THRESHOLDS,
): PartyReadiness {
  const perCharacter: Record<string, CharacterReadiness> = {};
  const blocking: PartyReadiness["blocking"] = [];

  for (const [characterId, signal] of Object.entries(party)) {
    const r = evaluateCharacter(signal, thresholds);
    perCharacter[characterId] = r;
    if (!r.ready) blocking.push({ characterId, nextFocus: r.nextFocus });
  }

  return {
    ready: blocking.length === 0 && Object.keys(party).length > 0,
    perCharacter,
    blocking,
  };
}
