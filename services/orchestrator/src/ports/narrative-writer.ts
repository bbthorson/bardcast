import type { BehaviorModel, Campaign, CampaignSeat, CharacterProfile, ScriptLine } from "@bardcast/domain";

export interface NarrativeCharacter {
  id: string;
  profile: CharacterProfile;
  /** The character at this table: reply-inferred traits and the sheet as played here. */
  seat: CampaignSeat | null;
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
  script?: ScriptLine[];
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
