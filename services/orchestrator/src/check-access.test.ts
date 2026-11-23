import { beforeAll, describe, expect, it } from "vitest";
import { P256Keypair } from "@atproto/crypto";
import { campaignSpace, managingAppRef, playerSpace, spaceRefUri, type SpaceKey } from "@bardcast/domain";
import { PwaEngagementChannel } from "@bardcast/engagement";
import { createApp } from "./app.js";
import { InMemoryStore } from "./adapters/in-memory-store.js";
import { StubAudioRenderer } from "./adapters/stub-audio-renderer.js";
import { StubDecisionModel } from "./adapters/stub-decision-model.js";
import { StubIdentityProvider } from "./adapters/stub-identity-provider.js";
import { StubNarrativeWriter } from "./adapters/stub-narrative-writer.js";
import { StubVoiceCloner } from "./adapters/stub-voice-cloner.js";
import { AtprotoServiceAuthVerifier } from "./adapters/atproto/service-auth.js";
import { didDoc, LXM, NOW, resolver, serviceJwt } from "./adapters/atproto/service-auth.fixtures.js";
import type { AntiphonyGateway, CoreServices } from "./ports/index.js";

const APP = "did:web:bardcast.app" as const;
const DM = "did:plc:dm";
const ALICE = "did:plc:alice";
const STRANGER = "did:plc:stranger";
const CAMPAIGN = "campaign.1a2b3c4d";

const host = await P256Keypair.create();
const otherAuthority = "did:plc:othertable";

function services(store: InMemoryStore, opts: { managing?: boolean } = {}): CoreServices {
  return {
    store,
    antiphony: {} as AntiphonyGateway,
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity: new StubIdentityProvider(),
    decisions: new StubDecisionModel(),
    engagement: new PwaEngagementChannel({ apiBaseUrl: "http://test", sendPush: async () => {}, promptUrl: (p) => p }),
    clock: () => new Date(NOW * 1000),
    ...(opts.managing === false
      ? {}
      : {
          managingApp: {
            appDid: APP,
            serviceAuth: new AtprotoServiceAuthVerifier({
              // Bardcast's spaces are hosted under its own DID: the host signs as it.
              resolver: resolver({ [APP]: didDoc(APP, host), [otherAuthority]: didDoc(otherAuthority, host) }),
              now: () => NOW * 1000,
            }),
          },
        }),
  };
}

const ref = (space: SpaceKey, authority: string = APP) => spaceRefUri({ authority, spaceType: space.type, skey: space.skey });

async function check(
  svc: CoreServices,
  q: { space: string; repo?: string; clientId?: string },
  auth?: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const token = auth === undefined ? await serviceJwt(host, { iss: APP, aud: managingAppRef(APP) }) : auth;
  const params = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => e[1] !== undefined));
  const res = await createApp(svc).request(`/xrpc/${LXM}?${params}`, {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("com.atproto.managedspace.checkAccess", () => {
  const store = new InMemoryStore();
  const svc = services(store);

  beforeAll(async () => {
    await store.putCampaign(CAMPAIGN, {
      title: "Thornwood",
      dm: DM,
      party: [`at://${ALICE}`],
      createdAt: "2026-11-01T00:00:00Z",
    });
  });

  it("lets a campaign's DM and party read and write its space, and nobody else", async () => {
    const space = ref(campaignSpace(CAMPAIGN));
    expect(await check(svc, { space, repo: DM })).toEqual({ status: 200, body: { read: true, write: true } });
    expect(await check(svc, { space, repo: ALICE, clientId: "https://bardcast.app/oauth-client-metadata.json" })).toEqual({
      status: 200,
      body: { read: true, write: true },
    });
    expect(await check(svc, { space, repo: STRANGER })).toEqual({ status: 200, body: { read: false, write: false } });
  });

  it("lets a player alone into their own space", async () => {
    expect((await check(svc, { space: ref(playerSpace(ALICE)), repo: ALICE })).body).toEqual({ read: true, write: true });
    expect((await check(svc, { space: ref(playerSpace(ALICE)), repo: DM })).body).toEqual({ read: false, write: false });
  });

  it("answers no for public reads (no repo), an unknown campaign, or a space type it doesn't make", async () => {
    expect((await check(svc, { space: ref(campaignSpace(CAMPAIGN)) })).body).toEqual({ read: false, write: false });
    expect((await check(svc, { space: ref(campaignSpace("campaign.gone")), repo: DM })).body).toEqual({ read: false, write: false });
    expect((await check(svc, { space: ref({ type: "fyi.opensocial.members", skey: "self" }), repo: DM })).body).toEqual({
      read: false,
      write: false,
    });
  });

  it("answers only the space's own authority", async () => {
    // Signed by another authority, about Bardcast's space: refused, not answered.
    const token = await serviceJwt(host, { iss: otherAuthority, aud: managingAppRef(APP) });
    const res = await check(svc, { space: ref(campaignSpace(CAMPAIGN)), repo: DM }, token);
    expect(res).toMatchObject({ status: 403, body: { error: "NotAuthorized" } });
    // About its own space, which Bardcast isn't the authority of: no access.
    const own = await check(svc, { space: ref(campaignSpace(CAMPAIGN), otherAuthority), repo: DM }, token);
    expect(own).toEqual({ status: 200, body: { read: false, write: false } });
  });

  it("refuses calls without valid service auth for this method and this app, with no answer", async () => {
    const space = ref(campaignSpace(CAMPAIGN));
    expect(await check(svc, { space, repo: DM }, null)).toMatchObject({ status: 401, body: { error: "AuthenticationRequired" } });
    const oldMethod = await serviceJwt(host, { iss: APP, aud: managingAppRef(APP), lxm: "com.atproto.simplespace.checkUserAccess" });
    expect(await check(svc, { space, repo: DM }, oldMethod)).toMatchObject({ status: 401, body: { error: "BadJwtLexiconMethod" } });
    const bareDid = await serviceJwt(host, { iss: APP, aud: APP });
    expect(await check(svc, { space, repo: DM }, bareDid)).toMatchObject({ status: 401, body: { error: "BadJwtAudience" } });
  });

  it("refuses a malformed space or repo", async () => {
    const record = `${ref(campaignSpace(CAMPAIGN))}/${DM}/dev.antiphony.audio.post/p1`;
    expect(await check(svc, { space: record, repo: DM })).toMatchObject({ status: 400, body: { error: "InvalidRequest" } });
    expect(await check(svc, { space: ref(campaignSpace(CAMPAIGN)), repo: "alice" })).toMatchObject({ status: 400 });
  });

  it("fails, rather than denies, when it can't decide", async () => {
    const broken = new InMemoryStore();
    broken.getCampaign = async () => {
      throw new Error("store down");
    };
    const res = await check(services(broken), { space: ref(campaignSpace(CAMPAIGN)), repo: DM });
    // Anything but 200 is UpstreamFailure at the host, never a loss of access.
    expect(res).toMatchObject({ status: 500, body: { error: "InternalServerError" } });
    expect(res.body).not.toHaveProperty("read");
  });

  it("fails, rather than denies, when the authority's DID document doesn't resolve", async () => {
    const lost: CoreServices = {
      ...svc,
      managingApp: { appDid: APP, serviceAuth: new AtprotoServiceAuthVerifier({ resolver: resolver({}), now: () => NOW * 1000 }) },
    };
    const res = await check(lost, { space: ref(campaignSpace(CAMPAIGN)), repo: DM });
    expect(res).toMatchObject({ status: 500, body: { error: "InternalServerError" } });
  });

  it("is not served until Bardcast's DID is configured", async () => {
    const res = await check(services(store, { managing: false }), { space: ref(campaignSpace(CAMPAIGN)), repo: DM });
    expect(res).toMatchObject({ status: 501, body: { error: "MethodNotImplemented" } });
  });
});
