/**
 * The slice of Cloudflare's D1 binding the D1 adapters use.
 *
 * Declared here rather than pulled from `@cloudflare/workers-types` so the
 * orchestrator still typechecks as a Node service, and so the tests can hand in
 * a small `node:sqlite` stand-in (see `d1-test-db.ts`).
 */
export interface D1Result<T> {
  results: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

/**
 * SQLite schema for D1: the Postgres `schema.sql` with JSONB stored as TEXT and
 * timestamps as ISO strings (they sort correctly as text).
 *
 * Every statement is idempotent, so `migrateD1` runs on the first request each
 * isolate serves, the same way the Node service runs `runMigrations` on boot.
 * TODO(bardcast): move to `wrangler d1 migrations` once the schema starts
 * changing shape rather than only growing.
 */
export const D1_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    dm_did TEXT NOT NULL,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_dm_did ON campaigns (dm_did)`,
  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    player_did TEXT,
    display_name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_characters_player_did ON characters (player_did)`,
  `CREATE TABLE IF NOT EXISTS character_sheets (
    campaign_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, character_id)
  )`,
  `CREATE TABLE IF NOT EXISTS character_behaviors (
    character_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS voice_profiles (
    character_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (campaign_id, chapter_index)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_campaign_id ON chapters (campaign_id)`,
  `CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_prompts_campaign_id ON prompts (campaign_id)`,
  `CREATE TABLE IF NOT EXISTS campaign_invites (
    code TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_sessions (
    sid TEXT PRIMARY KEY,
    did TEXT NOT NULL,
    handle TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_app_sessions_did ON app_sessions (did)`,
  `CREATE TABLE IF NOT EXISTS atproto_sessions (
    key TEXT PRIMARY KEY,
    session_data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS atproto_states (
    key TEXT PRIMARY KEY,
    state_data TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

export async function migrateD1(db: D1Database): Promise<void> {
  await db.batch(D1_SCHEMA.map((sql) => db.prepare(sql)));
}

/** Parse a TEXT JSON column. A row we cannot parse is a row we cannot use. */
export function parseJson<T>(raw: string | null | undefined): T | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
