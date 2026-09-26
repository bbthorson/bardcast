import { PwaEngagementChannel } from "@bardcast/engagement";
import { AntiphonyClient } from "@bardcast/antiphony-client";
import type { CoreServices } from "../ports/index.js";
import type { IdentityProvider } from "../ports/identity-provider.js";
import { AtprotoIdentityProvider } from "./atproto/identity-provider.js";
import { InMemoryStore } from "./in-memory-store.js";
import { StubAudioRenderer } from "./stub-audio-renderer.js";
import { StubIdentityProvider } from "./stub-identity-provider.js";
import { StubNarrativeWriter } from "./stub-narrative-writer.js";
import { StubVoiceCloner } from "./stub-voice-cloner.js";
import { ClientAntiphonyGateway } from "./antiphony-gateway.js";

export interface BuildServicesConfig {
  /** Base URL of the (Bardcast-controlled) Antiphony deployment. */
  antiphonyBaseUrl?: string;
  /** @deprecated use antiphonyBaseUrl */
  voxPopBaseUrl?: string;
  /** Player PWA base URL — engagement deep links + post-login redirect. */
  appBaseUrl: string;
  /** This service's own public URL — roots the AT-Proto client_id/redirect_uri. */
  orchestratorBaseUrl: string;
  /** "atproto" = real AT-Proto OAuth identity; "stub" = dev header-based. */
  auth: "stub" | "atproto";
  appName?: string;
  /** Bearer Bardcast presents to its own Antiphony deployment. */
  antiphonyServiceToken?: string;
  /** @deprecated use antiphonyServiceToken */
  voxPopServiceToken?: string;
}

/**
 * The composition root. Wires every port to an adapter and returns the bundle
 * the use-cases run against. This scaffold wires STUB adapters (except the
 * Antiphony client, which is real but points at a configured base URL).
 * Replacing a capability = swapping one line here.
 */
export function buildServices(config: BuildServicesConfig): CoreServices {
  const serviceToken = config.antiphonyServiceToken ?? config.voxPopServiceToken;
  const baseUrl = config.antiphonyBaseUrl ?? config.voxPopBaseUrl ?? "http://localhost:8080";

  const identity: IdentityProvider =
    config.auth === "atproto"
      ? new AtprotoIdentityProvider({
          baseUrl: config.orchestratorBaseUrl,
          appName: config.appName ?? "Bardcast",
          postLoginRedirect: config.appBaseUrl,
          ...(serviceToken !== undefined ? { antiphonyServiceToken: serviceToken } : {}),
        })
      : new StubIdentityProvider();

  // Antiphony is headless: the only credential is Bardcast's app service token
  // (establishes tenancy / originAppId). The acting player's DID is asserted
  // per write via the gateway's `actingDid`, not a per-player engine token — so
  // identity.tokenForPlayer is no longer on this path (see docs/integration-with-core.md).
  const antiphony = new AntiphonyClient({
    baseUrl,
    getServiceToken: () => serviceToken ?? "",
  });

  const engagement = new PwaEngagementChannel({
    apiBaseUrl: config.appBaseUrl,
    sendPush: async () => {
      // TODO(bardcast): real Web Push (VAPID).
    },
    promptUrl: (promptRef) => `${config.appBaseUrl}/play/${encodeURIComponent(promptRef)}`,
  });

  return {
    store: new InMemoryStore(),
    antiphony: new ClientAntiphonyGateway(antiphony),
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity,
    engagement,
    clock: () => new Date(),
  };
}
