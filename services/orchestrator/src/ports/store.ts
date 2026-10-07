import type {
  BehaviorModel,
  Campaign,
  Chapter,
  CharacterProfile,
  CampaignSeat,
  CharacterSheet,
  Prompt,
  StrongRef,
  VoiceProfile,
} from "@bardcast/domain";

export interface SheetVersion {
  ref: StrongRef;
  sheet: CharacterSheet;
}

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
  /**
   * Player-owned sheet versions. Immutable: a version is written once and
   * never updated (putSheetVersion rejects a URI it already holds). The
   * profile's `sheet` ref says which version is current; use-cases/sheets.ts
   * is the only writer.
   */
  putSheetVersion(characterId: string, ref: StrongRef, sheet: CharacterSheet): Promise<void>;
  getSheetVersion(uri: string): Promise<SheetVersion | null>;
  /** Every version of a character's sheet, oldest first. */
  listSheetVersions(characterId: string): Promise<SheetVersion[]>;
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
