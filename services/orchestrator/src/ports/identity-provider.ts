import type { Player } from "@bardcast/domain";

/**
 * AT-Protocol identity. This is Bardcast's responsibility: Antiphony is a
 * headless engine and does not handle user OAuth. Players sign in with their
 * AT-Proto identity; the resulting DID is the durable key a character follows
 * them across campaigns by.
 *
 * First adapter wraps @atproto/oauth-client-node.
 */
export interface IdentityProvider {
  /** Resolve an incoming request's session/cookie to the authenticated player. */
  resolveSession(headers: Headers): Promise<Player | null>;

  /** Mint the bearer token for this player. */
  tokenForPlayer(did: string): Promise<string>;
}
