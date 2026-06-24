import type { EngagementChannel } from "@bardcast/engagement";
import type { AudioRenderer } from "./audio-renderer.js";
import type { IdentityProvider } from "./identity-provider.js";
import type { NarrativeWriter } from "./narrative-writer.js";
import type { Store } from "./store.js";
import type { VoiceCloner } from "./voice-cloner.js";
import type { VoxPopGateway } from "./voxpop-gateway.js";

/**
 * The composition root's binding: every port the use-cases need, in one bag.
 * Mirrors vox-pop-core's `CoreServices` pattern. Built in adapters/index.ts;
 * swap any field for a real implementation without touching a use-case.
 */
export interface CoreServices {
  store: Store;
  voxpop: VoxPopGateway;
  narrative: NarrativeWriter;
  voice: VoiceCloner;
  audio: AudioRenderer;
  identity: IdentityProvider;
  engagement: EngagementChannel;
  clock: () => Date;
}
