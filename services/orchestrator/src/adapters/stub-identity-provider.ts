import type { Player } from "@bardcast/domain";
import type { IdentityProvider } from "../ports/identity-provider.js";

/**
 * Stub IdentityProvider — resolves a dev DID from an `x-bardcast-did` header and
 * mints a fake token. TODO(bardcast): real adapter wrapping
 * @atproto/oauth-client-node — full AT-Proto OAuth, session storage, and a token
 * vox-pop-core will accept as a bearer.
 */
export class StubIdentityProvider implements IdentityProvider {
  async resolveSession(headers: Headers): Promise<Player | null> {
    const did = headers.get("x-bardcast-did");
    if (!did) return null;
    return { did, handle: "dev.local", displayName: "Dev Player", createdAt: new Date().toISOString() };
  }

  async tokenForPlayer(did: string): Promise<string> {
    return `stub-token:${did}`;
  }
}
