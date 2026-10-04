import type { Player } from "@bardcast/domain";
import {
  NodeOAuthClient,
  requestLocalLock,
  type NodeOAuthClientOptions,
  type NodeSavedSessionStore,
  type NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { IdentityProvider } from "../../ports/identity-provider.js";
import {
  InMemoryAppSessionStore,
  InMemorySessionStore,
  InMemoryStateStore,
  type AppSessionStore,
} from "./stores.js";

const SESSION_COOKIE = "bardcast_sid";

/**
 * Ties an OAuth callback to the browser that started the sign-in. Without it,
 * anyone holding a callback URL from their own sign-in could get a victim's
 * browser to open it and sign the victim in as the attacker (login CSRF,
 * RFC 6749 §10.12). Same mechanism as vox-pop's `oauth-nonce.ts`.
 */
const NONCE_COOKIE = "bardcast_oauth_nonce";
const NONCE_MAX_AGE_S = 60 * 15;

export interface AtprotoConfig {
  /** Public base URL of the orchestrator (roots client_id + redirect_uri). */
  baseUrl: string;
  appName: string;
  /** Where to send the browser after a successful login (the player PWA). */
  postLoginRedirect: string;
  /**
   * Bearer Bardcast presents to its own Antiphony deployment.
   */
  antiphonyServiceToken?: string;
  /** @deprecated use antiphonyServiceToken */
  voxPopServiceToken?: string;
  /** Optional custom/persistent store for app sessions */
  appSessionStore?: AppSessionStore;
  /** Optional custom/persistent store for oauth session */
  sessionStore?: NodeSavedSessionStore;
  /** Optional custom/persistent store for oauth state */
  stateStore?: NodeSavedStateStore;
  /**
   * How handles become DIDs. Leave unset on Node. On Workers it must be set:
   * the Node default wraps fetch in undici's SSRF guard, which workerd lacks.
   */
  handleResolver?: NodeOAuthClientOptions["handleResolver"];
}

/**
 * Bardcast's OWN AT-Protocol identity layer. Self-contained: an
 * `@atproto/oauth-client-node` client, our own stores, our own app sessions.
 * The DID is the durable player identity a character follows across campaigns.
 *
 * Pattern borrowed from Bluesky's Statusphere example;
 * the code and all state are Bardcast's.
 */
export class AtprotoIdentityProvider implements IdentityProvider {
  private readonly client: NodeOAuthClient;
  private readonly appSessions: AppSessionStore;
  private readonly isLocalDev: boolean;
  private readonly clientMetadata: Record<string, unknown>;

  constructor(private readonly config: AtprotoConfig) {
    this.isLocalDev = config.baseUrl.includes("localhost") || config.baseUrl.includes("127.0.0.1");
    this.appSessions = config.appSessionStore ?? new InMemoryAppSessionStore();
    this.clientMetadata = this.buildClientMetadata();
    this.client = new NodeOAuthClient({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientMetadata: this.clientMetadata as any,
      stateStore: config.stateStore ?? new InMemoryStateStore(),
      sessionStore: config.sessionStore ?? new InMemorySessionStore(),
      // Single-instance dev lock. TODO(bardcast): a real cross-instance lock when
      // the orchestrator runs more than one replica.
      requestLock: requestLocalLock,
      ...(config.handleResolver !== undefined ? { handleResolver: config.handleResolver } : {}),
    });
  }

  // --- IdentityProvider port -------------------------------------------------

  async resolveSession(headers: Headers): Promise<Player | null> {
    const sid = parseCookie(headers.get("cookie"), SESSION_COOKIE);
    if (!sid) return null;
    const session = await this.appSessions.get(sid);
    if (!session) return null;
    return {
      did: session.did,
      createdAt: session.createdAt,
      ...(session.handle !== undefined ? { handle: session.handle } : {}),
    };
  }

  async tokenForPlayer(did: string): Promise<string> {
    return this.config.antiphonyServiceToken ?? this.config.voxPopServiceToken ?? `bardcast-did:${did}`;
  }

  // --- OAuth HTTP routes (mounted at /atproto) -------------------------------

  routes(): Hono {
    const app = new Hono();

    // Hosted client metadata (used as client_id in production).
    app.get("/client-metadata.json", (c) => c.json(this.clientMetadata));

    // Current session for the browser: the web front door polls this on load to
    // learn whether it's signed in (the session cookie is httpOnly, so JS can't
    // read it directly). Reuses resolveSession — the same seam writes use.
    app.get("/session", async (c) => {
      const player = await this.resolveSession(c.req.raw.headers);
      return c.json(player ? { authenticated: true, player } : { authenticated: false });
    });

    // Begin login: returns the PDS authorization URL to redirect the user to.
    app.post("/login", async (c) => {
      const { handle } = await c.req.json<{ handle?: string }>();
      if (!handle) return c.json({ error: "handle is required" }, 400);
      // The library keeps `state` server-side (it comes back from callback()),
      // so it can carry the nonce without the nonce ever reaching the PDS.
      const nonce = crypto.randomUUID();
      try {
        const url = await this.client.authorize(handle, { state: nonce });
        setCookie(c, NONCE_COOKIE, nonce, {
          httpOnly: true,
          // Lax still sends the cookie on the PDS's top-level redirect back to /callback.
          sameSite: "Lax",
          secure: !this.isLocalDev,
          path: "/atproto",
          maxAge: NONCE_MAX_AGE_S,
        });
        return c.json({ url: url.toString() });
      } catch (err) {
        // Most commonly an unresolvable handle. Return a clean client error
        // rather than leaking a 500 + stack trace.
        return c.json({ error: "atproto_authorize_failed", detail: String(err) }, 400);
      }
    });

    // OAuth callback: exchange code → session, mint a Bardcast app session.
    app.get("/callback", async (c) => {
      const params = new URLSearchParams(new URL(c.req.url).search);
      const nonce = getCookie(c, NONCE_COOKIE);
      deleteCookie(c, NONCE_COOKIE, { path: "/atproto" });
      try {
        const { session, state } = await this.client.callback(params);
        if (!nonce || state !== nonce) {
          // A valid code, but not for this browser. Drop the OAuth session it minted.
          await session.signOut().catch(() => undefined);
          return c.json({ error: "atproto_callback_failed", detail: "sign-in was started in a different browser" }, 400);
        }
        const sid = crypto.randomUUID();
        await this.appSessions.set(sid, { did: session.did, createdAt: new Date().toISOString() });
        setCookie(c, SESSION_COOKIE, sid, {
          httpOnly: true,
          // The web app and this API share an origin in production (one Worker),
          // and localhost ports are same-site in dev, so Lax is enough everywhere.
          sameSite: "Lax",
          secure: !this.isLocalDev,
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
        return c.redirect(this.config.postLoginRedirect);
      } catch (err) {
        return c.json({ error: "atproto_callback_failed", detail: String(err) }, 400);
      }
    });

    app.post("/logout", async (c) => {
      const sid = getCookie(c, SESSION_COOKIE);
      if (sid) await this.appSessions.del(sid);
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return c.body(null, 204);
    });

    return app;
  }

  // --- client metadata -------------------------------------------------------

  private buildClientMetadata(): Record<string, unknown> {
    const common = {
      client_name: this.config.appName,
      scope: "atproto",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
      dpop_bound_access_tokens: true,
    };

    if (this.isLocalDev) {
      // Loopback client: the AT-Proto spec allows http://127.0.0.1 with no
      // hosted metadata. redirect_uri must use 127.0.0.1, not localhost.
      const redirectUri = `${this.config.baseUrl.replace("localhost", "127.0.0.1")}/atproto/callback`;
      return {
        ...common,
        client_id: `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("atproto")}`,
        client_uri: this.config.baseUrl.replace("localhost", "127.0.0.1"),
        redirect_uris: [redirectUri],
      };
    }

    return {
      ...common,
      client_id: `${this.config.baseUrl}/atproto/client-metadata.json`,
      client_uri: this.config.baseUrl,
      redirect_uris: [`${this.config.baseUrl}/atproto/callback`],
    };
  }
}

/** Minimal cookie-header parser (resolveSession receives raw Headers). */
function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
