import type { BehaviorModel, Campaign, CharacterProfile, CharacterSheet } from "@bardcast/domain";

export interface NarrativeCharacter {
  id: string;
  profile: CharacterProfile;
  sheet: CharacterSheet | null;
  behavior: BehaviorModel | null;
}

export interface WriteChapterInput {
  campaign: Campaign;
  /** The ready party to feature. */
  characters: NarrativeCharacter[];
  /** Prior chapter transcripts for continuity (most recent last). */
  priorChapters: string[];
  /** Optional DM steer for this chapter. */
  directorNote?: string;
}

export interface WrittenChapter {
  title: string;
  transcript: string;
  /** In-world date (plain string — fantasy calendar). */
  storyDate?: string;
  /** Per-character beats to project into character.stateEvent records. */
  beats: Array<{ characterId: string; state: string; storyDate: string }>;
}

/**
 * Writes chapter prose from campaign lore + character state. The new creative
 * core. First adapter is an LLM call; the port keeps the loop provider-agnostic.
 */
export interface NarrativeWriter {
  writeChapter(input: WriteChapterInput): Promise<WrittenChapter>;
}
