import type { AtUri } from "@bardcast/domain";
import { AntiphonyClient, type VoxPopPrompt, type VoxPopReply } from "@bardcast/voxpop-client";
import type { VoxPopGateway } from "../ports/voxpop-gateway.js";

/**
 * Default VoxPopGateway adapter: wraps the real @bardcast/voxpop-client
 * (Antiphony Core API). The gateway is the narrow port the use-cases see; the
 * client is the HTTP detail.
 */
export class ClientVoxPopGateway implements VoxPopGateway {
  constructor(private readonly client: AntiphonyClient) {}

  async createPrompt(input: { title: string; scene?: string; actingDid: `did:${string}` }): Promise<VoxPopPrompt> {
    // The DM's scene text becomes the post body; the prompt is a post with no reply.
    return this.client.createPrompt(
      { title: input.title, ...(input.scene !== undefined ? { text: input.scene } : {}) },
      input.actingDid,
    );
  }

  async listReplies(promptUri: AtUri): Promise<VoxPopReply[]> {
    return this.client.listReplies({ prompt: promptUri });
  }
}
