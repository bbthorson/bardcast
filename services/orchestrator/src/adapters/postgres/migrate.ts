import type { SqlClient } from "../../ports/sql-client.js";
import type { Store } from "../../ports/store.js";
import type { Campaign, CharacterProfile, CharacterSheet } from "@bardcast/domain";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(128) PRIMARY KEY,
    dm_did VARCHAR(256) NOT NULL,
    title VARCHAR(200) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_dm_did ON campaigns (dm_did);

CREATE TABLE IF NOT EXISTS characters (
    id VARCHAR(128) PRIMARY KEY,
    player_did VARCHAR(256),
    display_name VARCHAR(120) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_characters_player_did ON characters (player_did);

CREATE TABLE IF NOT EXISTS character_sheets (
    campaign_id VARCHAR(128) NOT NULL,
    character_id VARCHAR(128) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (campaign_id, character_id)
);

CREATE TABLE IF NOT EXISTS character_behaviors (
    character_id VARCHAR(128) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_profiles (
    character_id VARCHAR(128) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chapters (
    id VARCHAR(128) PRIMARY KEY,
    campaign_id VARCHAR(128) NOT NULL,
    chapter_index INT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_chapters_campaign_index UNIQUE (campaign_id, chapter_index)
);

CREATE INDEX IF NOT EXISTS idx_chapters_campaign_id ON chapters (campaign_id);

CREATE TABLE IF NOT EXISTS prompts (
    id VARCHAR(128) PRIMARY KEY,
    campaign_id VARCHAR(128) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompts_campaign_id ON prompts (campaign_id);

CREATE TABLE IF NOT EXISTS campaign_invites (
    code VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(128) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    created_by VARCHAR(256) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * Runs DDL statements to ensure all tables and indexes exist.
 */
export async function runMigrations(sql: SqlClient): Promise<void> {
  const statements = SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await sql.query(statement);
  }
}

/**
 * Seeds the canonical Sir Gawain and the Green Knight starter campaign.
 */
export async function seedGawainCampaign(store: Store): Promise<void> {
  const campaignId = "gawain-green-knight";
  const existing = await store.getCampaign(campaignId);
  if (existing) return;

  const now = new Date().toISOString();
  const dmDid = "did:example:dm-wren";

  const partyCharacterIds = ["gawain", "ysolde", "cadoc", "morwen"];
  const campaign: Campaign = {
    title: "Sir Gawain and the Green Knight",
    dm: dmDid as any,
    premise: "Christmas to Christmas · Arthurian quest across the Wilderness of Wirral to the Green Chapel.",
    party: partyCharacterIds.map((id) => `at://${id}` as any),
    calendar: "Arthurian Lunar",
    createdAt: now,
  };

  await store.putCampaign(campaignId, campaign);

  const characterProfiles: Array<{ id: string; profile: CharacterProfile }> = [
    {
      id: "gawain",
      profile: {
        player: "did:example:theo" as any,
        displayName: "Sir Gawain",
        concept: "Arthur's nephew, sworn to keep a bargain he doesn't understand.",
        pronouns: "he/him",
        drives: [
          "Keep his word, even to a monster.",
          "Be worthy of the pentangle on his shield.",
          "Get through the year without anyone seeing him afraid.",
        ],
        createdAt: now,
      },
    },
    {
      id: "ysolde",
      profile: {
        player: "did:example:priya" as any,
        displayName: "Ysolde the Herald",
        concept: "Court chronicler who records vows that cannot be unmade.",
        pronouns: "she/her",
        drives: ["Witness the truth of Arthur's court.", "Protect Gawain from hubris."],
        createdAt: now,
      },
    },
    {
      id: "cadoc",
      profile: {
        player: "did:example:sam" as any,
        displayName: "Brother Cadoc",
        concept: "Wandering monk searching for holy places in untamed wilderness.",
        pronouns: "he/him",
        drives: ["Find divine grace in pagan lands.", "Keep the party alive."],
        createdAt: now,
      },
    },
    {
      id: "morwen",
      profile: {
        player: "did:example:jules" as any,
        displayName: "Morwen",
        concept: "Scout of the northern marches who knows the old woods.",
        pronouns: "they/them",
        drives: ["Survive the coming winter.", "Uncover the secret of Castle Hautdesert."],
        createdAt: now,
      },
    },
  ];

  for (const { id, profile } of characterProfiles) {
    await store.putCharacter(id, profile);
    const sheet: CharacterSheet = {
      campaign: `at://${campaignId}` as any,
      character: `at://${id}` as any,
      traits: [
        { name: "Courteous", value: "Courteous to a fault", confidence: 90 },
        { name: "Brave", value: "Stands firm before danger", confidence: 80 },
      ],
      sourceReplies: [],
      createdAt: now,
    };
    await store.putSheet(campaignId, id, sheet);
  }
}
