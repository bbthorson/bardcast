import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import type { AppSession, AppSessionStore } from "../atproto/stores.js";
import type { SealedJson } from "../atproto/sealed-json.js";
import type { D1Database } from "./d1.js";

/** App sessions last as long as the cookie that names them. */
export const APP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Authorization state only has to survive one redirect round trip. */
const STATE_TTL_MS = 60 * 60 * 1000;

/** Bardcast app sessions: opaque sid (the cookie) → the player's DID. */
export class D1AppSessionStore implements AppSessionStore {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => number = Date.now,
  ) {}

  async get(sid: string): Promise<AppSession | undefined> {
    const row = await this.db
      .prepare("SELECT did, handle, created_at AS createdAt FROM app_sessions WHERE sid = ?1")
      .bind(sid)
      .first<{ did: string; handle: string | null; createdAt: string }>();
    if (!row) return undefined;
    // The cookie's Max-Age is advisory; the server decides when a session ends.
    if (this.now() - Date.parse(row.createdAt) > APP_SESSION_TTL_MS) {
      await this.del(sid);
      return undefined;
    }
    return { did: row.did, createdAt: row.createdAt, ...(row.handle ? { handle: row.handle } : {}) };
  }

  async set(sid: string, session: AppSession): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO app_sessions (sid, did, handle, created_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (sid) DO UPDATE SET did = ?2, handle = ?3, created_at = ?4`,
      )
      .bind(sid, session.did, session.handle ?? null, session.createdAt)
      .run();
  }

  async del(sid: string): Promise<void> {
    await this.db.prepare("DELETE FROM app_sessions WHERE sid = ?1").bind(sid).run();
  }
}

/** Per-DID OAuth sessions (DPoP key + tokens), sealed at rest. */
export class D1SessionStore implements NodeSavedSessionStore {
  constructor(
    private readonly db: D1Database,
    private readonly sealer: SealedJson,
  ) {}

  async get(key: string): Promise<NodeSavedSession | undefined> {
    const row = await this.db
      .prepare("SELECT session_data FROM atproto_sessions WHERE key = ?1")
      .bind(key)
      .first<{ session_data: string }>();
    return row ? this.sealer.open<NodeSavedSession>(row.session_data) : undefined;
  }

  async set(key: string, value: NodeSavedSession): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO atproto_sessions (key, session_data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (key) DO UPDATE SET session_data = ?2, updated_at = ?3`,
      )
      .bind(key, await this.sealer.seal(value), new Date().toISOString())
      .run();
  }

  async del(key: string): Promise<void> {
    await this.db.prepare("DELETE FROM atproto_sessions WHERE key = ?1").bind(key).run();
  }
}

/** Short-lived authorization state (PKCE verifier + DPoP key), sealed at rest. */
export class D1StateStore implements NodeSavedStateStore {
  constructor(
    private readonly db: D1Database,
    private readonly sealer: SealedJson,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string): Promise<NodeSavedState | undefined> {
    const row = await this.db
      .prepare("SELECT state_data, created_at AS createdAt FROM atproto_states WHERE key = ?1")
      .bind(key)
      .first<{ state_data: string; createdAt: string }>();
    if (!row || this.now() - Date.parse(row.createdAt) > STATE_TTL_MS) return undefined;
    return this.sealer.open<NodeSavedState>(row.state_data);
  }

  async set(key: string, value: NodeSavedState): Promise<void> {
    const now = this.now();
    // Abandoned sign-ins never reach del(); sweep them whenever a new one starts.
    await this.db.batch([
      this.db
        .prepare("DELETE FROM atproto_states WHERE created_at < ?1")
        .bind(new Date(now - STATE_TTL_MS).toISOString()),
      this.db
        .prepare(
          `INSERT INTO atproto_states (key, state_data, created_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (key) DO UPDATE SET state_data = ?2, created_at = ?3`,
        )
        .bind(key, await this.sealer.seal(value), new Date(now).toISOString()),
    ]);
  }

  async del(key: string): Promise<void> {
    await this.db.prepare("DELETE FROM atproto_states WHERE key = ?1").bind(key).run();
  }
}
