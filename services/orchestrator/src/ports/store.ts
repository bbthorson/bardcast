import type {
  BehaviorModel,
  Campaign,
  Chapter,
  CharacterProfile,
  CampaignSeat,
  CharacterSheet,
  Prompt,
  VoiceProfile,
} from "@bardcast/domain";

export interface CampaignInvite {
  code: string;
  campaignId: string;
  createdBy: string;
}

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
  listCampaigns(filter?: { did?: string }): Promise<Array<{ id: string; campaign: Campaign }>>;

  // campaign invites
  createInvite(code: string, campaignId: string, createdBy: string): Promise<void>;
  getInvite(code: string): Promise<CampaignInvite | null>;
  deleteInvite(code: string): Promise<void>;

  // characters and their derived signal
  getCharacter(id: string): Promise<CharacterProfile | null>;
  putCharacter(id: string, profile: CharacterProfile): Promise<void>;
  /** The player-owned sheet: one per character, the same everywhere. */
  getCharacterSheet(characterId: string): Promise<CharacterSheet | null>;
  putCharacterSheet(characterId: string, sheet: CharacterSheet): Promise<void>;
  /** A character's seat at one campaign, branched from their sheet. */
  getSeat(campaignId: string, characterId: string): Promise<CampaignSeat | null>;
  putSeat(campaignId: string, characterId: string, seat: CampaignSeat): Promise<void>;
  getBehavior(characterId: string): Promise<BehaviorModel | null>;
  putBehavior(characterId: string, behavior: BehaviorModel): Promise<void>;
  getVoice(characterId: string): Promise<VoiceProfile | null>;
  putVoice(characterId: string, voice: VoiceProfile): Promise<void>;

  // chapters and prompts
  listChapters(campaignId: string): Promise<Chapter[]>;
  putChapter(id: string, chapter: Chapter): Promise<void>;
  listPrompts(campaignId: string): Promise<Prompt[]>;
  putPrompt(id: string, prompt: Prompt): Promise<void>;
  getPrompt(id: string): Promise<Prompt | null>;
}
