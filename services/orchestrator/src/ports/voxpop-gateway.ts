import type { AtUri } from "@bardcast/domain";
import type { VoxPopPrompt, VoxPopReply } from "@bardcast/voxpop-client";

/**
 * The loop's view of vox-pop-core. Wraps @bardcast/voxpop-client so use-cases
 * depend on this small interface, not the concrete HTTP client — keeps them
 * unit-testable and the engine swappable.
 */
export interface VoxPopGateway {
  createPrompt(input: { title: string; scene?: string; audioUrl?: string }): Promise<VoxPopPrompt>;
  listReplies(promptUri: AtUri): Promise<VoxPopReply[]>;
}
