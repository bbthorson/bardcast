import { AtprotoDohHandleResolver } from "@atproto-labs/handle-resolver";
import type { Player } from "@bardcast/domain";
import { createBlueskyAuth, type AuthStore, type BlueskyAuth } from "@bbthorson/atproto-cf-auth/server";
import { Hono } from "hono";
import type { IdentityProvider } from "../../ports/identity-provider.js";

export interface AtprotoConfig {
  appName: string;
  /** Where sessions and in-flight sign-ins live (D1 on Workers, memory in local Node dev). */
  store: AuthStore;
  /** Seals everything written to `store`. The `SESSION_SECRET` Worker secret. */
  secret: string;
  /**
   * Bearer Bardcast presents to its own Antiphony deployment.
   */
  antiphonyServiceToken?: string;
  /** @deprecated use antiphonyServiceToken */
  voxPopServiceToken?: string;
}

/**
 * Bardcast's AT-Protocol identity layer, on the shared
 * `@bbthorson/atproto-cf-auth` package (also used by Brad's other Bluesky apps).
 * The package runs the OAuth flow, the session cookie and the stores; this
 * adapter maps its user onto Bardcast's `Player` and mounts its routes at
 * `/atproto`, where the web app expects them.
 *
 * The DID is the durable player identity a character follows across campaigns.
 */
export class AtprotoIdentityProvider implements IdentityProvider {
  readonly auth: BlueskyAuth;

  constructor(private readonly config: AtprotoConfig) {
    this.auth = createBlueskyAuth({
      appName: config.appName,
      store: config.store,
      secret: config.secret,
      basePath: "/atproto",
      redirectTo: "/",
      handleResolver: new AtprotoDohHandleResolver({
        dohEndpoint: "https://cloudflare-dns.com/dns-query",
        fetch: edgeFetch,
      }),
    });
  }

  // --- IdentityProvider port -------------------------------------------------

  async resolveSession(headers: Headers): Promise<Player | null> {
    // getUser only reads the cookie header; the URL is a placeholder.
    const user = await this.auth.getUser(new Request("https://bardcast.invalid/", { headers }));
    if (!user) return null;
    return {
      did: user.did,
      createdAt: user.signedInAt,
      ...(user.handle !== undefined ? { handle: user.handle } : {}),
    };
  }

  async tokenForPlayer(did: string): Promise<string> {
    return this.config.antiphonyServiceToken ?? this.config.voxPopServiceToken ?? `bardcast-did:${did}`;
  }

  // --- OAuth HTTP routes (mounted at /atproto) -------------------------------

  /** login, callback, logout, session and client-metadata.json; see the package README. */
  routes(): Hono {
    const app = new Hono();
    app.all("*", async (c) => (await this.auth.handle(c.req.raw)) ?? c.notFound());
    return app;
  }
}

/**
 * `fetch` for handle resolution on Workers. The well-known resolver asks for
 * `redirect: "error"`, which Workers refuse outright, so without this every
 * handle without a DNS record (all of `*.bsky.social`) fails to resolve and
 * sign-in says "We couldn't find that handle". Same behaviour: a redirect is
 * an error.
 */
export const edgeFetch: typeof fetch = async (input, init) => {
  if (init?.redirect !== "error") return fetch(input, init);
  const res = await fetch(input, { ...init, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel();
    throw new TypeError(`Refused redirect from ${String(input)}`);
  }
  return res;
};
