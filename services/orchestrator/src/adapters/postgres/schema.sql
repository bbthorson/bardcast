-- Bardcast PostgreSQL Schema
-- Manages campaign state, derived character records and voice profiles.

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

-- Player-owned sheet versions (insert-only, and the profile points at the current
-- one) and campaign seats branched from them. These replace the old
-- campaign-scoped character_sheets table, which existing databases keep but
-- nothing reads (docs/character-creation.md).
CREATE TABLE IF NOT EXISTS sheet_versions (
    uri VARCHAR(512) PRIMARY KEY,
    character_id VARCHAR(128) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sheet_versions_character ON sheet_versions (character_id);

-- The campaign's action log: append-only. Seat state is derived from it.
CREATE TABLE IF NOT EXISTS campaign_actions (
    uri VARCHAR(512) PRIMARY KEY,
    campaign_id VARCHAR(128) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_actions_campaign ON campaign_actions (campaign_id);

CREATE TABLE IF NOT EXISTS campaign_seats (
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
