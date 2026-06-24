import { PwaEngagementChannel } from "@bardcast/engagement";
import { VoxPopClient } from "@bardcast/voxpop-client";
import type { CoreServices } from "../ports/index.js";
import type { IdentityProvider } from "../ports/identity-provider.js";
import { AtprotoIdentityProvider } from "./atproto/identity-provider.js";
import { InMemoryStore } from "./in-memory-store.js";
import { StubAudioRenderer } from "./stub-audio-renderer.js";
import { StubIdentityProvider } from "./stub-identity-provider.js";
import { StubNarrativeWriter } from "./stub-narrative-writer.js";
import { StubVoiceCloner } from "./stub-voice-cloner.js";
import { ClientVoxPopGateway } from "./voxpop-gateway.js";

export interface BuildServicesConfig {
  /** Base URL of the (Bardcast-controlled) vox-pop-core deployment. */
  voxPopBaseUrl: string;
  /** Player PWA base URL — engagement deep links + post-login redirect. */
  appBaseUrl: string;
  /** This service's own public URL — roots the AT-Proto client_id/redirect_uri. */
  orchestratorBaseUrl: string;
  /** "atproto" = real AT-Proto OAuth identity; "stub" = dev header-based. */
  auth: "stub" | "atproto";
  appName?: string;
  /** Bearer Bardcast presents to its own vox-pop-core (DID-trusting) deployment. */
  voxPopServiceToken?: string;
}

/**
 * The composition root. Wires every port to an adapter and returns the bundle
 * the use-cases run against. This scaffold wires STUB adapters (except the
 * vox-pop client, which is real but points at a configured base URL). Replacing
 * a capability = swapping one line here. Mirrors vox-pop-core's
 * core-services-firebase.ts composition root.
 */
export function buildServices(config: BuildServicesConfig): CoreServices {
  const identity: IdentityProvider =
    config.auth === "atproto"
      ? new AtprotoIdentityProvider({
          baseUrl: config.orchestratorBaseUrl,
          appName: config.appName ?? "Bardcast",
          postLoginRedirect: config.appBaseUrl,
          ...(config.voxPopServiceToken !== undefined
            ? { voxPopServiceToken: config.voxPopServiceToken }
            : {}),
        })
      : new StubIdentityProvider();

  const voxPopClient = new VoxPopClient({
    baseUrl: config.voxPopBaseUrl,
    // TODO(bardcast): thread the current player's token through per-request
    // instead of a static dev token.
    getToken: () => identity.tokenForPlayer("did:example:dev"),
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
    voxpop: new ClientVoxPopGateway(voxPopClient),
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity,
    engagement,
    clock: () => new Date(),
  };
}
