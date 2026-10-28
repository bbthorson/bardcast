import type {
  BehaviorModel,
  Campaign,
  CampaignSeat,
  CharacterCard,
  CharacterProfile,
  CreationAttribute,
  ScriptLine,
} from "@bardcast/domain";

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

/** Session zero so far: what the narrator asked and what the player said, in order. */
export type CreationConversation = Array<{ narrator: string; player?: string }>;

export interface WriteQuestionInput {
  conversation: CreationConversation;
  /** The character's name, once the player has said it. */
  name?: string;
  /** What the question is about. Chosen by Bardcast, not the writer. */
  attribute: CreationAttribute;
  /** The two options to tell apart, as key and meaning. */
  candidates: [{ key: string; meaning: string }, { key: string; meaning: string }];
}

export interface WriteCardInput {
  conversation: CreationConversation;
  name: string;
  /** What's settled, as attribute → option label ("class" → "Paladin"). */
  settled: Record<string, string>;
}

/** A line on the card's front. `quirk` and `drive` name one by index. */
export type CardLine =
  | { field: "concept" }
  | { field: "quote" }
  | { field: "quirk"; index: number }
  | { field: "drive"; index: number };

export interface ReviseCardLineInput extends WriteCardInput {
  card: CharacterCard;
  line: CardLine;
}

/**
 * Writes chapter prose from campaign lore + character state. The new creative
 * core. First adapter is an LLM call; the port keeps the loop provider-agnostic.
 *
 * It also speaks for the narrator in session zero
 * (docs/character-creation.md): it phrases follow-up questions and writes the
 * reveal card. It never decides what to ask about or settles an attribute.
 */
export interface NarrativeWriter {
  writeChapter(input: WriteChapterInput): Promise<WrittenChapter>;
  /** One narrator question that would tell the two candidates apart, in terms of what the player said. */
  writeQuestion(input: WriteQuestionInput): Promise<string>;
  /** The front of the reveal card. The quote must be the player's own words. */
  writeCard(input: WriteCardInput): Promise<CharacterCard>;
  /** A new take on one line of the card ("not quite"). Returns just that line. */
  reviseCardLine(input: ReviseCardLineInput): Promise<string>;
}
