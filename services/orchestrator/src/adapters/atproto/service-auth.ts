import { formatDidVerificationMethod, verifySignature } from "@atproto/crypto";
import { createDidResolver, type DidResolver } from "@atproto-labs/did-resolver";
import { ServiceAuthError, type ServiceAuthVerifier } from "../../ports/service-auth.js";

/**
 * Verifies atproto service auth, as `@atproto/xrpc-server`'s `verifyJwt` does,
 * without that package (it brings an Express server into a Worker). The order
 * and error names follow it: structure, type, expiry, audience, method, issuer,
 * then the signature against the issuer's `#atproto` key, retried once against
 * a freshly resolved DID document in case the key was just rotated.
 *
 * Unlike `verifyJwt`, a token with no `exp` is refused.
 *
 * `@atproto/crypto` and `@atproto-labs/did-resolver` are pinned exactly to the
 * Spaces alpha Antiphony runs (docs/spaces-beta-readiness.md).
 */
export class AtprotoServiceAuthVerifier implements ServiceAuthVerifier {
  private readonly resolver: Pick<DidResolver, "resolve">;
  private readonly now: () => number;

  constructor(opts: { resolver?: Pick<DidResolver, "resolve">; now?: () => number } = {}) {
    this.resolver = opts.resolver ?? createDidResolver({});
    this.now = opts.now ?? Date.now;
  }

  async verify(token: string, expect: { aud: string; lxm: string }): Promise<{ iss: string }> {
    const parts = token.split(".");
    if (parts.length !== 3) throw new ServiceAuthError("poorly formatted jwt", "BadJwt");
    const [h, p, s] = parts as [string, string, string];
    const header = decodeJson(h);
    const payload = decodeJson(p);

    // Service tokens are not access tokens, refresh tokens or DPoP proofs.
    if (header["typ"] === "at+jwt" || header["typ"] === "refresh+jwt" || header["typ"] === "dpop+jwt") {
      throw new ServiceAuthError(`invalid jwt type "${String(header["typ"])}"`, "BadJwtType");
    }
    const alg = header["alg"];
    if (alg !== "ES256" && alg !== "ES256K") throw new ServiceAuthError("unsupported jwt alg", "BadJwt");

    const exp = payload["exp"];
    if (typeof exp !== "number") throw new ServiceAuthError("jwt has no expiry", "BadJwt");
    if (this.now() / 1000 > exp) throw new ServiceAuthError("jwt expired", "JwtExpired");
    if (payload["aud"] !== expect.aud) {
      throw new ServiceAuthError("jwt audience does not match this service", "BadJwtAudience");
    }
    if (payload["lxm"] !== expect.lxm) {
      throw new ServiceAuthError(`bad jwt lexicon method ("lxm"). must match: ${expect.lxm}`, "BadJwtLexiconMethod");
    }
    const iss = payload["iss"];
    // A space host signs as the space's authority: a bare DID, never `did#service`.
    if (typeof iss !== "string" || !/^did:(plc|web):[a-zA-Z0-9._:%-]+$/.test(iss)) {
      throw new ServiceAuthError("jwt iss is not a valid did", "BadJwtIss");
    }

    const msg = new TextEncoder().encode(`${h}.${p}`);
    const sig = base64UrlBytes(s);
    if (await this.signedBy(iss, msg, sig, alg, false)) return { iss };
    if (await this.signedBy(iss, msg, sig, alg, true)) return { iss };
    throw new ServiceAuthError("jwt signature does not match jwt issuer", "BadJwtSignature");
  }

  private async signedBy(iss: string, msg: Uint8Array, sig: Uint8Array, alg: string, fresh: boolean): Promise<boolean> {
    // A DID that doesn't resolve is thrown as is: we couldn't decide.
    const doc = await this.resolver.resolve(iss as `did:${string}:${string}`, fresh ? { noCache: true } : {});
    const method = doc.verificationMethod?.find(
      (m) => typeof m === "object" && (m.id === "#atproto" || m.id === `${iss}#atproto`),
    );
    if (!method || typeof method !== "object" || typeof method.publicKeyMultibase !== "string") {
      throw new ServiceAuthError(`${iss} publishes no #atproto signing key`, "BadJwtSignature");
    }
    try {
      const didKey = formatDidVerificationMethod({ type: method.type, publicKeyMultibase: method.publicKeyMultibase });
      return await verifySignature(didKey, msg, sig, { jwtAlg: alg, allowMalleableSig: true });
    } catch {
      throw new ServiceAuthError("could not verify jwt signature", "BadJwtSignature");
    }
  }
}

function base64UrlBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

function decodeJson(s: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ServiceAuthError("poorly formatted jwt", "BadJwt");
}
