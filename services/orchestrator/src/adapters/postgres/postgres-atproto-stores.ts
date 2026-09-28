import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import type { SqlClient } from "../../ports/sql-client.js";
import type { AppSession, AppSessionStore } from "../atproto/stores.js";

/**
 * PostgreSQL persistent store for Bardcast app sessions (tied to session cookies).
 */
export class PostgresAppSessionStore implements AppSessionStore {
  constructor(private readonly sql: SqlClient) {}

  async get(sid: string): Promise<AppSession | undefined> {
    const rows = await this.sql.query<{ did: string; handle?: string; createdAt: string }>(
      `SELECT did, handle, created_at as "createdAt" FROM app_sessions WHERE sid = $1`,
      [sid],
    );
    if (!rows[0]) return undefined;
    const r = rows[0];
    return {
      did: r.did,
      ...(r.handle ? { handle: r.handle } : {}),
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(r.createdAt).toISOString(),
    };
  }

  async set(sid: string, session: AppSession): Promise<void> {
    await this.sql.query(
      `INSERT INTO app_sessions (sid, did, handle, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sid) DO UPDATE SET did = $2, handle = $3, created_at = $4`,
      [sid, session.did, session.handle ?? null, session.createdAt],
    );
  }

  async del(sid: string): Promise<void> {
    await this.sql.query("DELETE FROM app_sessions WHERE sid = $1", [sid]);
  }
}

/**
 * PostgreSQL persistent store for AT-Proto OAuth sessions.
 */
export class PostgresSessionStore implements NodeSavedSessionStore {
  constructor(private readonly sql: SqlClient) {}

  async get(key: string): Promise<NodeSavedSession | undefined> {
    const rows = await this.sql.query<{ session_data: NodeSavedSession }>(
      "SELECT session_data FROM atproto_sessions WHERE key = $1",
      [key],
    );
    return rows[0]?.session_data;
  }

  async set(key: string, value: NodeSavedSession): Promise<void> {
    await this.sql.query(
      `INSERT INTO atproto_sessions (key, session_data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET session_data = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  }

  async del(key: string): Promise<void> {
    await this.sql.query("DELETE FROM atproto_sessions WHERE key = $1", [key]);
  }
}

/**
 * PostgreSQL persistent store for AT-Proto OAuth short-lived state (PKCE/DPoP).
 */
export class PostgresStateStore implements NodeSavedStateStore {
  constructor(private readonly sql: SqlClient) {}

  async get(key: string): Promise<NodeSavedState | undefined> {
    const rows = await this.sql.query<{ state_data: NodeSavedState }>(
      "SELECT state_data FROM atproto_states WHERE key = $1",
      [key],
    );
    return rows[0]?.state_data;
  }

  async set(key: string, value: NodeSavedState): Promise<void> {
    await this.sql.query(
      `INSERT INTO atproto_states (key, state_data, created_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET state_data = $2::jsonb, created_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  }

  async del(key: string): Promise<void> {
    await this.sql.query("DELETE FROM atproto_states WHERE key = $1", [key]);
  }
}
