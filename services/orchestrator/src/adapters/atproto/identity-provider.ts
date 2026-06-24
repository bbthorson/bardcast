import type { Player } from "@bardcast/domain";
import { NodeOAuthClient, requestLocalLock } from "@atproto/oauth-client-node";
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

export interface AtprotoConfig {
  /** Public base URL of the orchestrator (roots client_id + redirect_uri). */
  baseUrl: string;
  appName: string;
  /** Where to send the browser after a successful login (the player PWA). */
  postLoginRedirect: string;
  /**
   * Bearer Bardcast presents to ITS OWN vox-pop-core deployment. Bardcast's
   * identity is independent of vox-pop's — core must run a DID-trusting auth
   * adapter (its auth-port.ts anticipates a DidAuthAdapter). We never call
   * vox-pop's identity endpoints.
   */
  voxPopServiceToken?: string;
}

/**
 * Bardcast's OWN AT-Protocol identity layer. Self-contained: an
 * `@atproto/oauth-client-node` client, our own stores, our own app sessions.
 * The DID is the durable player identity a character follows across campaigns.
 *
 * Pattern borrowed from Bluesky's Statusphere example and vox-pop/apps/web;
 * the code and all state are Bardcast's, with no dependency on the vox-pop repo.
 */
export class AtprotoIdentityProvider implements IdentityProvider {
  private readonly client: NodeOAuthClient;
  private readonly appSessions: AppSessionStore;
  private readonly isLocalDev: boolean;
  private readonly clientMetadata: Record<string, unknown>;

  constructor(private readonly config: AtprotoConfig) {
    this.isLocalDev = config.baseUrl.includes("localhost") || config.baseUrl.includes("127.0.0.1");
    this.appSessions = new InMemoryAppSessionStore();
    this.clientMetadata = this.buildClientMetadata();
    this.client = new NodeOAuthClient({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientMetadata: this.clientMetadata as any,
      stateStore: new InMemoryStateStore(),
      sessionStore: new InMemorySessionStore(),
      // Single-instance dev lock. TODO(bardcast): a real cross-instance lock when
      // the orchestrator runs more than one replica.
      requestLock: requestLocalLock,
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
    // Independence: NOT a vox-pop identity token. This is what Bardcast presents
    // to its own vox-pop-core deployment, which must trust Bardcast's DID auth.
    // TODO(bardcast): mint a real signed (e.g. service-JWT) assertion over the DID.
    return this.config.voxPopServiceToken ?? `bardcast-did:${did}`;
  }

  // --- OAuth HTTP routes (mounted at /atproto) -------------------------------

  routes(): Hono {
    const app = new Hono();

    // Hosted client metadata (used as client_id in production).
    app.get("/client-metadata.json", (c) => c.json(this.clientMetadata));

    // Begin login: returns the PDS authorization URL to redirect the user to.
    app.post("/login", async (c) => {
      const { handle } = await c.req.json<{ handle?: string }>();
      if (!handle) return c.json({ error: "handle is required" }, 400);
      const state = crypto.randomUUID();
      try {
        const url = await this.client.authorize(handle, { state });
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
      try {
        const { session } = await this.client.callback(params);
        const sid = crypto.randomUUID();
        await this.appSessions.set(sid, { did: session.did, createdAt: new Date().toISOString() });
        setCookie(c, SESSION_COOKIE, sid, {
          httpOnly: true,
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
