import type { Player } from "@bardcast/domain";

/**
 * AT-Protocol identity. This is Bardcast's responsibility: vox-pop-core
 * deliberately keeps OAuth in its closed `apps/web` tier, so the open engine
 * never sees it. Players sign in with their AT-Proto identity; the resulting DID
 * is the durable key a character follows them across campaigns by.
 *
 * First adapter wraps @atproto/oauth-client-node. The token this yields is also
 * what the VoxPopGateway presents to vox-pop-core as a bearer token.
 */
export interface IdentityProvider {
  /** Resolve an incoming request's session/cookie to the authenticated player. */
  resolveSession(headers: Headers): Promise<Player | null>;

  /** Mint the bearer token vox-pop-core will accept for this player. */
  tokenForPlayer(did: string): Promise<string>;
}
