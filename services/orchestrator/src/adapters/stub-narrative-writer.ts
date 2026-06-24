import type { NarrativeWriter, WriteChapterInput, WrittenChapter } from "../ports/narrative-writer.js";

/**
 * Stub NarrativeWriter — returns a deterministic placeholder chapter so the loop
 * runs end to end without an LLM. TODO(bardcast): replace with a real adapter
 * that prompts an LLM using campaign.premise + each character's sheet/behavior,
 * and asks for per-character beats to project into stateEvents.
 */
export class StubNarrativeWriter implements NarrativeWriter {
  async writeChapter(input: WriteChapterInput): Promise<WrittenChapter> {
    const names = input.characters.map((c) => c.profile.displayName);
    const index = input.priorChapters.length + 1;
    return {
      title: `Chapter ${index}: The Road Goes On`,
      transcript:
        `[STUB NARRATIVE]\nCampaign: ${input.campaign.title}\n` +
        `Party: ${names.join(", ")}\n` +
        (input.directorNote ? `DM note: ${input.directorNote}\n` : "") +
        `\nTODO(bardcast): real narrative generation from lore + character state.`,
      storyDate: "the 1st of Firstmoon",
      beats: input.characters.map((c) => ({
        characterId: c.id,
        state: `${c.profile.displayName} takes a first step into the unknown.`,
        storyDate: "the 1st of Firstmoon",
      })),
    };
  }
}
