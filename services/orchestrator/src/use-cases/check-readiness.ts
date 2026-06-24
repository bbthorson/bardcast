import {
  evaluateParty,
  type CharacterSignal,
  type PartyReadiness,
  type ReadinessThresholds,
} from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";

/**
 * Step 3 of the loop: the readiness gate. Loads every party character's signal
 * and asks @bardcast/domain whether the campaign can generate its next chapter.
 * The DM console polls this to show per-character progress and the "what to
 * prompt next" hint; the answer also gates `generateChapter`.
 */
export async function checkReadiness(
  svc: CoreServices,
  input: { characterIds: string[]; thresholds?: ReadinessThresholds },
): Promise<PartyReadiness> {
  const party: Record<string, CharacterSignal> = {};

  for (const id of input.characterIds) {
    const [sheet, behavior, voice] = await Promise.all([
      svc.store.getSheet(id),
      svc.store.getBehavior(id),
      svc.store.getVoice(id),
    ]);
    party[id] = {
      sheet: sheet ?? undefined,
      behavior: behavior ?? undefined,
      voice: voice ?? undefined,
    };
  }

  return input.thresholds ? evaluateParty(party, input.thresholds) : evaluateParty(party);
}
