import type {
  BehaviorModel,
  CampaignAction,
  Campaign,
  Chapter,
  CharacterProfile,
  CampaignSeat,
  CharacterSheet,
  Prompt,
  StrongRef,
  VoiceProfile,
} from "@bardcast/domain";
import type { CampaignInvite, SheetVersion, Store } from "../ports/store.js";

/**
 * In-memory Store — the default adapter for local dev and tests. Swap for a
 * Firestore/Postgres adapter in production (see CLAUDE.md ports & adapters).
 */
export class InMemoryStore implements Store {
  private campaigns = new Map<string, Campaign>();
  private characters = new Map<string, CharacterProfile>();
  /** Keyed by version URI. Insert-only: versions are immutable. */
  private sheetVersions = new Map<string, SheetVersion & { characterId: string }>();
  private seats = new Map<string, CampaignSeat>();
  private actions = new Map<string, { campaignId: string; uri: string; action: CampaignAction }>();
  private behaviors = new Map<string, BehaviorModel>();
  private voices = new Map<string, VoiceProfile>();
  private chapters = new Map<string, Chapter>();
  private prompts = new Map<string, Prompt>();
  private invites = new Map<string, CampaignInvite>();

  async getCampaign(id: string) {
    return this.campaigns.get(id) ?? null;
  }
  async putCampaign(id: string, campaign: Campaign) {
    this.campaigns.set(id, campaign);
  }
  async listCampaigns(filter?: { did?: string }) {
    const list: Array<{ id: string; campaign: Campaign }> = [];
    for (const [id, campaign] of this.campaigns.entries()) {
      if (!filter?.did) {
        list.push({ id, campaign });
      } else {
        const isDm = campaign.dm === filter.did;
        const isParty = campaign.party.includes(`at://${filter.did}` as any);
        if (isDm || isParty) {
          list.push({ id, campaign });
        }
      }
    }
    return list;
  }

  async createInvite(code: string, campaignId: string, createdBy: string) {
    this.invites.set(code, { code, campaignId, createdBy });
  }
  async getInvite(code: string) {
    return this.invites.get(code) ?? null;
  }
  async deleteInvite(code: string) {
    this.invites.delete(code);
  }

  async getCharacter(id: string) {
    return this.characters.get(id) ?? null;
  }
  async putCharacter(id: string, profile: CharacterProfile) {
    this.characters.set(id, profile);
  }
  async putSheetVersion(characterId: string, ref: StrongRef, sheet: CharacterSheet) {
    if (this.sheetVersions.has(ref.uri)) throw new Error(`sheet version ${ref.uri} already exists; versions are immutable`);
    this.sheetVersions.set(ref.uri, { characterId, ref, sheet });
  }
  async getSheetVersion(uri: string) {
    const v = this.sheetVersions.get(uri);
    return v ? { ref: v.ref, sheet: v.sheet } : null;
  }
  async listSheetVersions(characterId: string) {
    return [...this.sheetVersions.values()]
      .filter((v) => v.characterId === characterId)
      .map(({ ref, sheet }) => ({ ref, sheet }));
  }
  async getSeat(campaignId: string, characterId: string) {
    return this.seats.get(`${campaignId}/${characterId}`) ?? null;
  }
  async putSeat(campaignId: string, characterId: string, seat: CampaignSeat) {
    this.seats.set(`${campaignId}/${characterId}`, seat);
  }
  async listSeats(campaignId: string) {
    const prefix = `${campaignId}/`;
    return [...this.seats.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, seat]) => ({ characterId: key.slice(prefix.length), seat }));
  }
  async putAction(campaignId: string, uri: string, action: CampaignAction) {
    if (this.actions.has(uri)) throw new Error(`action ${uri} already exists; the log is append-only`);
    this.actions.set(uri, { campaignId, uri, action });
  }
  async listActions(campaignId: string) {
    return [...this.actions.values()]
      .filter((a) => a.campaignId === campaignId)
      .sort((a, b) => a.action.createdAt.localeCompare(b.action.createdAt) || a.uri.localeCompare(b.uri))
      .map(({ uri, action }) => ({ uri, action }));
  }
  async getBehavior(characterId: string) {
    return this.behaviors.get(characterId) ?? null;
  }
  async putBehavior(characterId: string, behavior: BehaviorModel) {
    this.behaviors.set(characterId, behavior);
  }
  async getVoice(characterId: string) {
    return this.voices.get(characterId) ?? null;
  }
  async putVoice(characterId: string, voice: VoiceProfile) {
    this.voices.set(characterId, voice);
  }
  async listChapters(campaignId: string) {
    return [...this.chapters.values()]
      .filter((c) => c.campaign === `at://${campaignId}`)
      .sort((a, b) => a.index - b.index);
  }
  async putChapter(id: string, chapter: Chapter) {
    this.chapters.set(id, chapter);
  }
  async listPrompts(campaignId: string): Promise<Prompt[]> {
    return [...this.prompts.values()]
      .filter((p) => p.campaign === `at://${campaignId}` || p.campaign === campaignId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async putPrompt(id: string, prompt: Prompt) {
    this.prompts.set(id, prompt);
  }
  async getPrompt(id: string) {
    return this.prompts.get(id) ?? null;
  }
}
