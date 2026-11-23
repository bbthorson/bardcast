import { describe, expect, it } from "vitest";
import { P256Keypair, Secp256k1Keypair } from "@atproto/crypto";
import { ServiceAuthError } from "../../ports/service-auth.js";
import { AtprotoServiceAuthVerifier } from "./service-auth.js";
import { AUD, didDoc, HOST, LXM, NOW, resolver, serviceJwt } from "./service-auth.fixtures.js";

async function failure(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ServiceAuthError);
  return (err as ServiceAuthError).code;
}

describe("AtprotoServiceAuthVerifier", () => {
  const expect_ = { aud: AUD, lxm: LXM };

  it("accepts a host's token signed with its #atproto key, P-256 or secp256k1", async () => {
    for (const key of [await P256Keypair.create(), await Secp256k1Keypair.create()]) {
      const v = new AtprotoServiceAuthVerifier({ resolver: resolver({ [HOST]: didDoc(HOST, key) }), now: () => NOW * 1000 });
      expect(await v.verify(await serviceJwt(key), expect_)).toEqual({ iss: HOST });
    }
  });

  it("refuses the wrong audience, method, type, expiry or issuer", async () => {
    const key = await P256Keypair.create();
    const v = new AtprotoServiceAuthVerifier({ resolver: resolver({ [HOST]: didDoc(HOST, key) }), now: () => NOW * 1000 });
    expect(await failure(v.verify(await serviceJwt(key, { aud: "did:web:bardcast.app" }), expect_))).toBe("BadJwtAudience");
    // The old protocol's method name is refused.
    expect(await failure(v.verify(await serviceJwt(key, { lxm: "com.atproto.simplespace.checkUserAccess" }), expect_))).toBe(
      "BadJwtLexiconMethod",
    );
    expect(await failure(v.verify(await serviceJwt(key, { lxm: undefined }), expect_))).toBe("BadJwtLexiconMethod");
    expect(await failure(v.verify(await serviceJwt(key, {}, { typ: "at+jwt" }), expect_))).toBe("BadJwtType");
    expect(await failure(v.verify(await serviceJwt(key, { exp: NOW - 1 }), expect_))).toBe("JwtExpired");
    expect(await failure(v.verify(await serviceJwt(key, { exp: undefined }), expect_))).toBe("BadJwt");
    expect(await failure(v.verify(await serviceJwt(key, { iss: `${HOST}#atproto_labeler` }), expect_))).toBe("BadJwtIss");
    expect(await failure(v.verify("not.a.jwt", expect_))).toBe("BadJwt");
    expect(await failure(v.verify("nope", expect_))).toBe("BadJwt");
  });

  it("refuses a token signed by any other key, after checking for a rotation", async () => {
    const key = await P256Keypair.create();
    const other = await P256Keypair.create();
    const r = resolver({ [HOST]: didDoc(HOST, key) });
    const v = new AtprotoServiceAuthVerifier({ resolver: r, now: () => NOW * 1000 });
    expect(await failure(v.verify(await serviceJwt(other), expect_))).toBe("BadJwtSignature");
    expect(r.calls).toEqual([
      { did: HOST, noCache: false },
      { did: HOST, noCache: true },
    ]);
  });

  it("accepts a key rotated since the cached document", async () => {
    const old = await P256Keypair.create();
    const rotated = await P256Keypair.create();
    const v = new AtprotoServiceAuthVerifier({
      resolver: resolver({ [HOST]: didDoc(HOST, old) }, { [HOST]: didDoc(HOST, rotated) }),
      now: () => NOW * 1000,
    });
    expect(await v.verify(await serviceJwt(rotated), expect_)).toEqual({ iss: HOST });
  });

  it("refuses an issuer that publishes no #atproto key", async () => {
    const key = await P256Keypair.create();
    const v = new AtprotoServiceAuthVerifier({ resolver: resolver({ [HOST]: { id: HOST } }), now: () => NOW * 1000 });
    expect(await failure(v.verify(await serviceJwt(key), expect_))).toBe("BadJwtSignature");
  });

  it("doesn't call an unresolvable issuer's token bad: it couldn't decide", async () => {
    const key = await P256Keypair.create();
    const v = new AtprotoServiceAuthVerifier({ resolver: resolver({}), now: () => NOW * 1000 });
    const err = await v.verify(await serviceJwt(key), expect_).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ServiceAuthError);
  });
});
