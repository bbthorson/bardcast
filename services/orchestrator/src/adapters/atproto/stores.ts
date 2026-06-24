import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";

/**
 * In-memory OAuth stores for local dev. The OAuth client uses these to hold
 * short-lived flow state (DPoP keypair + PKCE verifier) and long-lived per-DID
 * DPoP sessions.
 *
 * TODO(bardcast): persistent, encrypted stores for production (a process
 * restart drops these, forcing re-auth). vox-pop/apps/web's session-crypto +
 * HTTP-backed stores are the production reference — but the persistence is
 * Bardcast's own, not shared with vox-pop.
 */
export class InMemoryStateStore implements NodeSavedStateStore {
  private map = new Map<string, NodeSavedState>();
  async get(key: string): Promise<NodeSavedState | undefined> {
    return this.map.get(key);
  }
  async set(key: string, value: NodeSavedState): Promise<void> {
    this.map.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class InMemorySessionStore implements NodeSavedSessionStore {
  private map = new Map<string, NodeSavedSession>();
  async get(key: string): Promise<NodeSavedSession | undefined> {
    return this.map.get(key);
  }
  async set(key: string, value: NodeSavedSession): Promise<void> {
    this.map.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/** A signed-in Bardcast app session — opaque sid → the player's DID. */
export interface AppSession {
  did: string;
  handle?: string;
  createdAt: string;
}

export interface AppSessionStore {
  get(sid: string): Promise<AppSession | undefined>;
  set(sid: string, session: AppSession): Promise<void>;
  del(sid: string): Promise<void>;
}

export class InMemoryAppSessionStore implements AppSessionStore {
  private map = new Map<string, AppSession>();
  async get(sid: string): Promise<AppSession | undefined> {
    return this.map.get(sid);
  }
  async set(sid: string, session: AppSession): Promise<void> {
    this.map.set(sid, session);
  }
  async del(sid: string): Promise<void> {
    this.map.delete(sid);
  }
}
