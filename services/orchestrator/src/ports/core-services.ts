import type { EngagementChannel } from "@bardcast/engagement";
import type { AudioRenderer } from "./audio-renderer.js";
import type { DecisionModel } from "./decision-model.js";
import type { IdentityProvider } from "./identity-provider.js";
import type { NarrativeWriter } from "./narrative-writer.js";
import type { Store } from "./store.js";
import type { VoiceCloner } from "./voice-cloner.js";
import type { AntiphonyGateway } from "./antiphony-gateway.js";
import type { ServiceAuthVerifier } from "./service-auth.js";

/**
 * Bardcast as the managing app of its spaces: the DID it manages them under,
 * and how it checks a space host's service auth. Absent until `BARDCAST_DID` is
 * configured; `com.atproto.managedspace.checkAccess` answers
 * `MethodNotImplemented` without it.
 */
export interface ManagingApp {
  /** Bardcast's DID: the authority of every space it makes today. */
  appDid: `did:${string}`;
  serviceAuth: ServiceAuthVerifier;
}

/**
 * The composition root's binding: every port the use-cases need, in one bag.
 * Mirrors Antiphony's `CoreServices` pattern. Built in adapters/index.ts;
 * swap any field for a real implementation without touching a use-case.
 */
export interface CoreServices {
  store: Store;
  antiphony: AntiphonyGateway;
  narrative: NarrativeWriter;
  voice: VoiceCloner;
  audio: AudioRenderer;
  identity: IdentityProvider;
  decisions: DecisionModel;
  engagement: EngagementChannel;
  clock: () => Date;
  managingApp?: ManagingApp;
}
