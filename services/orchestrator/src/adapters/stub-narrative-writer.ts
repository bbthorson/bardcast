import { playerQuoteFrom, type CharacterCard } from "@bardcast/domain";
import type {
  NarrativeWriter,
  ReviseCardLineInput,
  WriteCardInput,
  WriteChapterInput,
  WriteQuestionInput,
  WrittenChapter,
} from "../ports/narrative-writer.js";

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
      script: [
        {
          speaker: "narrator",
          text: `The road stretches out under a pale sky. ${input.campaign.title} begins its next telling.`,
        },
        ...input.characters.map((c) => ({
          speaker: c.id,
          text: `“I am ready,” ${c.profile.displayName} murmurs, checking their gear.`,
        })),
        { speaker: "narrator", text: "And so the company journeys forth into the unknown." },
      ],
      storyDate: "the 1st of Firstmoon",
      beats: input.characters.map((c) => ({
        characterId: c.id,
        state: `${c.profile.displayName} takes a first step into the unknown.`,
        storyDate: "the 1st of Firstmoon",
      })),
    };
  }

  /**
   * A template question naming both candidates. TODO(bardcast): an LLM that
   * phrases it in the narrator's voice and picks up the player's own details.
   */
  async writeQuestion(input: WriteQuestionInput): Promise<string> {
    const [a, b] = input.candidates;
    return `Tell me more. Is it closer to this: ${a.meaning}? Or this: ${b.meaning}?`;
  }

  /** A card from the settled attributes, quoting the player's longest answer. TODO(bardcast): an LLM. */
  async writeCard(input: WriteCardInput): Promise<CharacterCard> {
    const settled = Object.values(input.settled);
    return {
      concept: `${input.name}, ${settled.slice(0, 3).join(", ").toLowerCase() || "an adventurer"}.`,
      quirks: settled.slice(3, 6).map((s) => `Known for being ${s.toLowerCase()}.`).concat(settled.length > 3 ? [] : ["Keeps their own counsel."]),
      drives: ["To find out what they're made of."],
      quote: playerQuoteFrom(input.conversation.flatMap((t) => (t.player ? [t.player] : []))),
    };
  }

  async reviseCardLine(input: ReviseCardLineInput): Promise<string> {
    const line = input.line;
    switch (line.field) {
      case "concept":
        return `${input.name}, still finding their way.`;
      case "quote":
        return input.card.quote;
      case "quirk":
        return `Has a habit nobody's named yet (${line.index + 1}).`;
      case "drive":
        return "To prove someone wrong.";
    }
  }
}
