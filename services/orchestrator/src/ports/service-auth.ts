/**
 * Verifies the atproto service auth a remote service sends us: a short-lived
 * JWT, signed with the issuer's atproto signing key, naming us (`aud`) and the
 * one method it may call (`lxm`). A space host calling Bardcast's
 * `com.atproto.managedspace.checkAccess` signs as the space's authority.
 */
export interface ServiceAuthVerifier {
  /**
   * Verify `token` for a call to `lxm` addressed to `aud`. Returns the
   * verified issuer, or throws `ServiceAuthError` for a token that fails.
   * Throws anything else when it couldn't decide (the issuer's DID document
   * didn't resolve): that is our failure, not the caller's.
   */
  verify(token: string, expect: { aud: string; lxm: string }): Promise<{ iss: string }>;
}

/** XRPC error names, as `@atproto/xrpc-server` uses them for service auth. */
export type ServiceAuthErrorCode =
  | "BadJwt"
  | "BadJwtType"
  | "JwtExpired"
  | "BadJwtAudience"
  | "BadJwtLexiconMethod"
  | "BadJwtIss"
  | "BadJwtSignature";

export class ServiceAuthError extends Error {
  constructor(
    message: string,
    readonly code: ServiceAuthErrorCode,
  ) {
    super(message);
    this.name = "ServiceAuthError";
  }
}
