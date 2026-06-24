import type { CoreServices } from "../ports/index.js";
import { checkReadiness } from "./check-readiness.js";

export interface PromptSuggestion {
  title: string;
  scene: string;
  /** Which character the prompt is aimed at. */
  characterId: string;
  /** Which readiness axis it's meant to advance. */
  intent: "sheet" | "behavior" | "voice" | "story";
  /** Why the system is suggesting this now. */
  rationale: string;
}

/**
 * Step 5 of the loop: hand the DM new prompt ideas. Two sources feed this:
 *  1. Readiness gaps — for any not-yet-ready character, suggest a prompt aimed
 *     at their weakest axis (`nextFocus`).
 *  2. Story momentum — given the latest chapter, suggest prompts that pull the
 *     narrative forward (delegated to the narrative provider; TODO).
 *
 * The scaffold implements (1) deterministically and stubs (2).
 */
export async function suggestPrompts(
  svc: CoreServices,
  input: { campaignId: string; characterIds: string[] },
): Promise<PromptSuggestion[]> {
  const readiness = await checkReadiness(svc, { characterIds: input.characterIds });
  const suggestions: PromptSuggestion[] = [];

  for (const { characterId, nextFocus } of readiness.blocking) {
    if (!nextFocus) continue;
    suggestions.push(gapPrompt(characterId, nextFocus));
  }

  // TODO(bardcast): ask the NarrativeWriter for story-momentum prompts based on
  // the latest chapter + campaign premise, and append them here.

  return suggestions;
}

function gapPrompt(
  characterId: string,
  axis: "sheet" | "behavior" | "voice",
): PromptSuggestion {
  switch (axis) {
    case "sheet":
      return {
        characterId,
        intent: "sheet",
        title: "Tell me about a scar you carry — where did it come from?",
        scene:
          "The party makes camp. Firelight catches an old mark on your skin and someone asks about it.",
        rationale: "Character sheet is thin — this draws out background and a defining trait.",
      };
    case "behavior":
      return {
        characterId,
        intent: "behavior",
        title: "A stranger offers you a shortcut that means abandoning a wounded ally. What do you do?",
        scene: "The road forks. One path is fast and cold; the other, slow and loyal.",
        rationale: "Need more decision examples to model how this character acts under pressure.",
      };
    case "voice":
      return {
        characterId,
        intent: "voice",
        title: "Say your character's battle cry — and then a line they'd whisper to a friend.",
        scene: "Two registers, loud and soft, so we capture your full range.",
        rationale: "Voice clone needs more (and more varied) audio before it's ready.",
      };
  }
}
