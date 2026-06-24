import type {
  BehaviorModel,
  Campaign,
  Chapter,
  CharacterProfile,
  CharacterSheet,
  Prompt,
  VoiceProfile,
} from "@bardcast/domain";
import type { Store } from "../ports/store.js";

/**
 * In-memory Store — the default adapter for local dev and tests. Swap for a
 * Firestore/Postgres adapter in production (see CLAUDE.md ports & adapters).
 * TODO(bardcast): real persistence adapter.
 */
export class InMemoryStore implements Store {
  private campaigns = new Map<string, Campaign>();
  private characters = new Map<string, CharacterProfile>();
  private sheets = new Map<string, CharacterSheet>();
  private behaviors = new Map<string, BehaviorModel>();
  private voices = new Map<string, VoiceProfile>();
  private chapters = new Map<string, Chapter>();
  private prompts = new Map<string, Prompt>();

  async getCampaign(id: string) {
    return this.campaigns.get(id) ?? null;
  }
  async putCampaign(id: string, campaign: Campaign) {
    this.campaigns.set(id, campaign);
  }
  async getCharacter(id: string) {
    return this.characters.get(id) ?? null;
  }
  async putCharacter(id: string, profile: CharacterProfile) {
    this.characters.set(id, profile);
  }
  async getSheet(characterId: string) {
    return this.sheets.get(characterId) ?? null;
  }
  async putSheet(characterId: string, sheet: CharacterSheet) {
    this.sheets.set(characterId, sheet);
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
  async putPrompt(id: string, prompt: Prompt) {
    this.prompts.set(id, prompt);
  }
}
