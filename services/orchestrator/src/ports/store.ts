import type {
  BehaviorModel,
  Campaign,
  Chapter,
  CharacterProfile,
  CharacterSheet,
  Prompt,
  VoiceProfile,
} from "@bardcast/domain";

/**
 * Persistence port. The source-of-truth campaign/character STATE lives here.
 * The AT-Proto record layer (lexicons/) is a derived projection of this state,
 * never the other way around (see CLAUDE.md, supper_club ARCHITECTURE.md §2).
 *
 * Keys are stable local ids (`char.*`, `campaign.*`) that map to DIDs.
 */
export interface Store {
  // campaigns
  getCampaign(id: string): Promise<Campaign | null>;
  putCampaign(id: string, campaign: Campaign): Promise<void>;

  // characters and their derived signal
  getCharacter(id: string): Promise<CharacterProfile | null>;
  putCharacter(id: string, profile: CharacterProfile): Promise<void>;
  getSheet(characterId: string): Promise<CharacterSheet | null>;
  putSheet(characterId: string, sheet: CharacterSheet): Promise<void>;
  getBehavior(characterId: string): Promise<BehaviorModel | null>;
  putBehavior(characterId: string, behavior: BehaviorModel): Promise<void>;
  getVoice(characterId: string): Promise<VoiceProfile | null>;
  putVoice(characterId: string, voice: VoiceProfile): Promise<void>;

  // chapters and prompts
  listChapters(campaignId: string): Promise<Chapter[]>;
  putChapter(id: string, chapter: Chapter): Promise<void>;
  putPrompt(id: string, prompt: Prompt): Promise<void>;
}
