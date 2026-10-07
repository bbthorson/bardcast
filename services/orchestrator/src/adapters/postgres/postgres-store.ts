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
import type { SqlClient } from "../../ports/sql-client.js";
import type { CampaignInvite, Store } from "../../ports/store.js";

/**
 * PostgreSQL implementation of the Store port.
 * Uses parameterised SQL queries against an SqlClient.
 */
export class PostgresStore implements Store {
  constructor(private readonly sql: SqlClient) {}

  async getCampaign(id: string): Promise<Campaign | null> {
    const rows = await this.sql.query<{ data: Campaign }>(
      "SELECT data FROM campaigns WHERE id = $1",
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async putCampaign(id: string, campaign: Campaign): Promise<void> {
    await this.sql.query(
      `INSERT INTO campaigns (id, dm_did, title, data, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (id) DO UPDATE SET dm_did = $2, title = $3, data = $4::jsonb`,
      [id, campaign.dm, campaign.title, JSON.stringify(campaign), campaign.createdAt],
    );
  }

  async listCampaigns(filter?: { did?: string }): Promise<Array<{ id: string; campaign: Campaign }>> {
    let text = "SELECT id, data FROM campaigns";
    const params: unknown[] = [];
    if (filter?.did) {
      text += " WHERE dm_did = $1 OR data->'party' @> $2::jsonb";
      params.push(filter.did, JSON.stringify([`at://${filter.did}`]));
    }
    text += " ORDER BY created_at DESC";
    const rows = await this.sql.query<{ id: string; data: Campaign }>(text, params);
    return rows.map((r) => ({ id: r.id, campaign: r.data }));
  }

  async createInvite(code: string, campaignId: string, createdBy: string): Promise<void> {
    await this.sql.query(
      `INSERT INTO campaign_invites (code, campaign_id, created_by, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (code) DO UPDATE SET campaign_id = $2, created_by = $3`,
      [code, campaignId, createdBy],
    );
  }

  async getInvite(code: string): Promise<CampaignInvite | null> {
    const rows = await this.sql.query<{ code: string; campaignId: string; createdBy: string }>(
      `SELECT code, campaign_id as "campaignId", created_by as "createdBy"
       FROM campaign_invites WHERE code = $1`,
      [code],
    );
    return rows[0] ?? null;
  }

  async deleteInvite(code: string): Promise<void> {
    await this.sql.query("DELETE FROM campaign_invites WHERE code = $1", [code]);
  }

  async getCharacter(id: string): Promise<CharacterProfile | null> {
    const rows = await this.sql.query<{ data: CharacterProfile }>(
      "SELECT data FROM characters WHERE id = $1",
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async putCharacter(id: string, profile: CharacterProfile): Promise<void> {
    await this.sql.query(
      `INSERT INTO characters (id, player_did, display_name, data, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (id) DO UPDATE SET player_did = $2, display_name = $3, data = $4::jsonb`,
      [id, profile.player ?? null, profile.displayName, JSON.stringify(profile), profile.createdAt],
    );
  }

  async getCharacterSheet(characterId: string): Promise<CharacterSheet | null> {
    const rows = await this.sql.query<{ data: CharacterSheet }>(
      "SELECT data FROM player_sheets WHERE character_id = $1",
      [characterId],
    );
    return rows[0]?.data ?? null;
  }

  async putCharacterSheet(characterId: string, sheet: CharacterSheet): Promise<void> {
    await this.sql.query(
      `INSERT INTO player_sheets (character_id, data, created_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (character_id) DO UPDATE SET data = $2::jsonb`,
      [characterId, JSON.stringify(sheet), sheet.createdAt],
    );
  }

  async getSeat(campaignId: string, characterId: string): Promise<CampaignSeat | null> {
    const rows = await this.sql.query<{ data: CampaignSeat }>(
      "SELECT data FROM campaign_seats WHERE campaign_id = $1 AND character_id = $2",
      [campaignId, characterId],
    );
    return rows[0]?.data ?? null;
  }

  async putSeat(campaignId: string, characterId: string, seat: CampaignSeat): Promise<void> {
    await this.sql.query(
      `INSERT INTO campaign_seats (campaign_id, character_id, data, created_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (campaign_id, character_id) DO UPDATE SET data = $3::jsonb`,
      [campaignId, characterId, JSON.stringify(seat), seat.createdAt],
    );
  }

  async getBehavior(characterId: string): Promise<BehaviorModel | null> {
    const rows = await this.sql.query<{ data: BehaviorModel }>(
      "SELECT data FROM character_behaviors WHERE character_id = $1",
      [characterId],
    );
    return rows[0]?.data ?? null;
  }

  async putBehavior(characterId: string, behavior: BehaviorModel): Promise<void> {
    await this.sql.query(
      `INSERT INTO character_behaviors (character_id, data, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (character_id) DO UPDATE SET data = $2::jsonb, updated_at = $3`,
      [characterId, JSON.stringify(behavior), behavior.updatedAt],
    );
  }

  async getVoice(characterId: string): Promise<VoiceProfile | null> {
    const rows = await this.sql.query<{ data: VoiceProfile }>(
      "SELECT data FROM voice_profiles WHERE character_id = $1",
      [characterId],
    );
    return rows[0]?.data ?? null;
  }

  async putVoice(characterId: string, voice: VoiceProfile): Promise<void> {
    await this.sql.query(
      `INSERT INTO voice_profiles (character_id, data, created_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (character_id) DO UPDATE SET data = $2::jsonb`,
      [characterId, JSON.stringify(voice), voice.createdAt],
    );
  }

  async listChapters(campaignId: string): Promise<Chapter[]> {
    const rows = await this.sql.query<{ data: Chapter }>(
      "SELECT data FROM chapters WHERE campaign_id = $1 ORDER BY chapter_index ASC",
      [campaignId],
    );
    return rows.map((r) => r.data);
  }

  async putChapter(id: string, chapter: Chapter): Promise<void> {
    const campaignId = chapter.campaign.replace(/^at:\/\//, "");
    await this.sql.query(
      `INSERT INTO chapters (id, campaign_id, chapter_index, data, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (id) DO UPDATE SET campaign_id = $2, chapter_index = $3, data = $4::jsonb`,
      [id, campaignId, chapter.index, JSON.stringify(chapter), chapter.createdAt],
    );
  }

  async listPrompts(campaignId: string): Promise<Prompt[]> {
    const rows = await this.sql.query<{ data: Prompt }>(
      "SELECT data FROM prompts WHERE campaign_id = $1 ORDER BY created_at ASC",
      [campaignId],
    );
    return rows.map((r) => r.data);
  }

  async putPrompt(id: string, prompt: Prompt): Promise<void> {
    const campaignId = prompt.campaign.replace(/^at:\/\//, "");
    await this.sql.query(
      `INSERT INTO prompts (id, campaign_id, data, created_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (id) DO UPDATE SET data = $3::jsonb`,
      [id, campaignId, JSON.stringify(prompt), prompt.createdAt],
    );
  }

  async getPrompt(id: string): Promise<Prompt | null> {
    const rows = await this.sql.query<{ data: Prompt }>(
      "SELECT data FROM prompts WHERE id = $1",
      [id],
    );
    return rows[0]?.data ?? null;
  }
}
