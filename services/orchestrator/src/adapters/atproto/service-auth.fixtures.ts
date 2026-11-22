import type { Keypair } from "@atproto/crypto";

/** Test helpers: service-auth JWTs and DID documents, as a space host makes them. */

export const HOST = "did:plc:table";
export const AUD = "did:web:bardcast.app#bardcast_spaces";
export const LXM = "com.atproto.managedspace.checkAccess";
export const NOW = Date.UTC(2026, 11, 2) / 1000;

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

/** A service-auth JWT, as `@atproto/xrpc-server`'s `createServiceJwt` builds one. */
export async function serviceJwt(
  key: Keypair,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): Promise<string> {
  const h = b64({ typ: "JWT", alg: key.jwtAlg, ...header });
  const p = b64({ iss: HOST, aud: AUD, lxm: LXM, iat: NOW, exp: NOW + 60, jti: "j1", ...claims });
  const sig = Buffer.from(await key.sign(new TextEncoder().encode(`${h}.${p}`))).toString("base64url");
  return `${h}.${p}.${sig}`;
}

/** A DID document publishing `key` as `#atproto`, as did:plc writes it (Multikey). */
export function didDoc(did: string, key: Keypair) {
  return {
    id: did,
    verificationMethod: [
      { id: `${did}#atproto`, type: "Multikey", controller: did, publicKeyMultibase: key.did().slice("did:key:".length) },
    ],
  };
}

/** A resolver over fixed documents. `fresh` is what a cache-bypassing read sees. */
export function resolver(docs: Record<string, unknown>, fresh: Record<string, unknown> = docs) {
  const calls: Array<{ did: string; noCache: boolean }> = [];
  return {
    calls,
    async resolve(did: string, opts?: { noCache?: boolean }) {
      calls.push({ did, noCache: Boolean(opts?.noCache) });
      const doc = (opts?.noCache ? fresh : docs)[did];
      if (!doc) throw new Error(`could not resolve ${did}`);
      return doc as never;
    },
  };
}
