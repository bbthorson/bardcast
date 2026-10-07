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
import type { CampaignInvite, SheetVersion, Store } from "../../ports/store.js";
import { parseJson, type D1Database } from "./d1.js";

type DataRow = { data: string };

/**
 * Cloudflare D1 (SQLite) implementation of the Store port. Mirrors
 * `PostgresStore` query for query; JSON documents live in TEXT columns.
 */
export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  private async one<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const row = await this.db.prepare(sql).bind(...params).first<DataRow>();
    return parseJson<T>(row?.data);
  }

  private async many<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const { results } = await this.db.prepare(sql).bind(...params).all<DataRow>();
    return results.flatMap((r) => {
      const value = parseJson<T>(r.data);
      return value === null ? [] : [value];
    });
  }

  private async exec(sql: string, ...params: unknown[]): Promise<void> {
    await this.db.prepare(sql).bind(...params).run();
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return this.one<Campaign>("SELECT data FROM campaigns WHERE id = ?1", id);
  }

  async putCampaign(id: string, campaign: Campaign): Promise<void> {
    await this.exec(
      `INSERT INTO campaigns (id, dm_did, title, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (id) DO UPDATE SET dm_did = ?2, title = ?3, data = ?4`,
      id,
      campaign.dm,
      campaign.title,
      JSON.stringify(campaign),
      campaign.createdAt,
    );
  }

  async listCampaigns(filter?: { did?: string }): Promise<Array<{ id: string; campaign: Campaign }>> {
    // Postgres uses `data->'party' @> [...]`; json_each is the SQLite spelling.
    const stmt = filter?.did
      ? this.db
          .prepare(
            `SELECT id, data FROM campaigns
             WHERE dm_did = ?1
                OR EXISTS (SELECT 1 FROM json_each(campaigns.data, '$.party') WHERE json_each.value = ?2)
             ORDER BY created_at DESC`,
          )
          .bind(filter.did, `at://${filter.did}`)
      : this.db.prepare("SELECT id, data FROM campaigns ORDER BY created_at DESC");
    const { results } = await stmt.all<{ id: string; data: string }>();
    return results.flatMap((r) => {
      const campaign = parseJson<Campaign>(r.data);
      return campaign ? [{ id: r.id, campaign }] : [];
    });
  }

  async createInvite(code: string, campaignId: string, createdBy: string): Promise<void> {
    await this.exec(
      `INSERT INTO campaign_invites (code, campaign_id, created_by, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (code) DO UPDATE SET campaign_id = ?2, created_by = ?3`,
      code,
      campaignId,
      createdBy,
      new Date().toISOString(),
    );
  }

  async getInvite(code: string): Promise<CampaignInvite | null> {
    return this.db
      .prepare(
        `SELECT code, campaign_id AS campaignId, created_by AS createdBy FROM campaign_invites WHERE code = ?1`,
      )
      .bind(code)
      .first<CampaignInvite>();
  }

  async deleteInvite(code: string): Promise<void> {
    await this.exec("DELETE FROM campaign_invites WHERE code = ?1", code);
  }

  async getCharacter(id: string): Promise<CharacterProfile | null> {
    return this.one<CharacterProfile>("SELECT data FROM characters WHERE id = ?1", id);
  }

  async putCharacter(id: string, profile: CharacterProfile): Promise<void> {
    await this.exec(
      `INSERT INTO characters (id, player_did, display_name, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (id) DO UPDATE SET player_did = ?2, display_name = ?3, data = ?4`,
      id,
      profile.player ?? null,
      profile.displayName,
      JSON.stringify(profile),
      profile.createdAt,
    );
  }

  async putSheetVersion(characterId: string, ref: StrongRef, sheet: CharacterSheet): Promise<void> {
    // Plain INSERT, no upsert: a second write to the same URI fails. Versions are immutable.
    await this.exec(
      "INSERT INTO sheet_versions (uri, character_id, data, created_at) VALUES (?1, ?2, ?3, ?4)",
      ref.uri,
      characterId,
      JSON.stringify({ ref, sheet }),
      sheet.createdAt,
    );
  }

  async getSheetVersion(uri: string): Promise<SheetVersion | null> {
    return this.one<SheetVersion>("SELECT data FROM sheet_versions WHERE uri = ?1", uri);
  }

  async listSheetVersions(characterId: string): Promise<SheetVersion[]> {
    return this.many<SheetVersion>(
      "SELECT data FROM sheet_versions WHERE character_id = ?1 ORDER BY created_at ASC, uri ASC",
      characterId,
    );
  }

  async getSeat(campaignId: string, characterId: string): Promise<CampaignSeat | null> {
    return this.one<CampaignSeat>(
      "SELECT data FROM campaign_seats WHERE campaign_id = ?1 AND character_id = ?2",
      campaignId,
      characterId,
    );
  }

  async putSeat(campaignId: string, characterId: string, seat: CampaignSeat): Promise<void> {
    await this.exec(
      `INSERT INTO campaign_seats (campaign_id, character_id, data, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (campaign_id, character_id) DO UPDATE SET data = ?3`,
      campaignId,
      characterId,
      JSON.stringify(seat),
      seat.createdAt,
    );
  }

  async listSeats(campaignId: string): Promise<Array<{ characterId: string; seat: CampaignSeat }>> {
    const rows = await this.db
      .prepare("SELECT character_id, data FROM campaign_seats WHERE campaign_id = ?1 ORDER BY character_id")
      .bind(campaignId)
      .all<{ character_id: string; data: string }>();
    return rows.results.flatMap((r) => {
      const seat = parseJson<CampaignSeat>(r.data);
      return seat ? [{ characterId: r.character_id, seat }] : [];
    });
  }

  async putAction(campaignId: string, uri: string, action: CampaignAction): Promise<void> {
    // Plain INSERT, no upsert: the log is append-only.
    await this.exec(
      "INSERT INTO campaign_actions (uri, campaign_id, data, created_at) VALUES (?1, ?2, ?3, ?4)",
      uri,
      campaignId,
      JSON.stringify({ uri, action }),
      action.createdAt,
    );
  }

  async listActions(campaignId: string): Promise<Array<{ uri: string; action: CampaignAction }>> {
    return this.many<{ uri: string; action: CampaignAction }>(
      "SELECT data FROM campaign_actions WHERE campaign_id = ?1 ORDER BY created_at ASC, uri ASC",
      campaignId,
    );
  }

  async getBehavior(characterId: string): Promise<BehaviorModel | null> {
    return this.one<BehaviorModel>("SELECT data FROM character_behaviors WHERE character_id = ?1", characterId);
  }

  async putBehavior(characterId: string, behavior: BehaviorModel): Promise<void> {
    await this.exec(
      `INSERT INTO character_behaviors (character_id, data, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (character_id) DO UPDATE SET data = ?2, updated_at = ?3`,
      characterId,
      JSON.stringify(behavior),
      behavior.updatedAt,
    );
  }

  async getVoice(characterId: string): Promise<VoiceProfile | null> {
    return this.one<VoiceProfile>("SELECT data FROM voice_profiles WHERE character_id = ?1", characterId);
  }

  async putVoice(characterId: string, voice: VoiceProfile): Promise<void> {
    await this.exec(
      `INSERT INTO voice_profiles (character_id, data, created_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (character_id) DO UPDATE SET data = ?2`,
      characterId,
      JSON.stringify(voice),
      voice.createdAt,
    );
  }

  async listChapters(campaignId: string): Promise<Chapter[]> {
    return this.many<Chapter>(
      "SELECT data FROM chapters WHERE campaign_id = ?1 ORDER BY chapter_index ASC",
      campaignId,
    );
  }

  async putChapter(id: string, chapter: Chapter): Promise<void> {
    await this.exec(
      `INSERT INTO chapters (id, campaign_id, chapter_index, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (id) DO UPDATE SET campaign_id = ?2, chapter_index = ?3, data = ?4`,
      id,
      chapter.campaign.replace(/^at:\/\//, ""),
      chapter.index,
      JSON.stringify(chapter),
      chapter.createdAt,
    );
  }

  async listPrompts(campaignId: string): Promise<Prompt[]> {
    return this.many<Prompt>("SELECT data FROM prompts WHERE campaign_id = ?1 ORDER BY created_at ASC", campaignId);
  }

  async putPrompt(id: string, prompt: Prompt): Promise<void> {
    await this.exec(
      `INSERT INTO prompts (id, campaign_id, data, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (id) DO UPDATE SET data = ?3`,
      id,
      prompt.campaign.replace(/^at:\/\//, ""),
      JSON.stringify(prompt),
      prompt.createdAt,
    );
  }

  async getPrompt(id: string): Promise<Prompt | null> {
    return this.one<Prompt>("SELECT data FROM prompts WHERE id = ?1", id);
  }
}
