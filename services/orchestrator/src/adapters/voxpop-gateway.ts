import type { AtUri } from "@bardcast/domain";
import { VoxPopClient, type VoxPopPrompt, type VoxPopReply } from "@bardcast/voxpop-client";
import type { VoxPopGateway } from "../ports/voxpop-gateway.js";

/**
 * Default VoxPopGateway adapter: wraps the real @bardcast/voxpop-client. The
 * gateway is the narrow port the use-cases see; the client is the HTTP detail.
 */
export class ClientVoxPopGateway implements VoxPopGateway {
  constructor(private readonly client: VoxPopClient) {}

  async createPrompt(input: { title: string; scene?: string; audioUrl?: string }): Promise<VoxPopPrompt> {
    return this.client.createPrompt({
      title: input.title,
      ...(input.scene !== undefined ? { description: input.scene } : {}),
      ...(input.audioUrl !== undefined ? { audioUrl: input.audioUrl } : {}),
    });
  }

  async listReplies(promptUri: AtUri): Promise<VoxPopReply[]> {
    const page = await this.client.listReplies({ promptUri });
    return page.items;
  }
}
