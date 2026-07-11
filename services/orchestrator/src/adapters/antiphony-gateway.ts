import type { AtUri } from "@bardcast/domain";
import { AntiphonyClient, type AntiphonyPrompt, type AntiphonyReply } from "@bardcast/antiphony-client";
import type { AntiphonyGateway } from "../ports/antiphony-gateway.js";

/**
 * Default AntiphonyGateway adapter: wraps the real @bardcast/antiphony-client
 * (Antiphony Core API). The gateway is the narrow port the use-cases see; the
 * client is the HTTP detail.
 */
export class ClientAntiphonyGateway implements AntiphonyGateway {
  constructor(private readonly client: AntiphonyClient) {}

  async createPrompt(input: { title: string; scene?: string; actingDid: `did:${string}` }): Promise<AntiphonyPrompt> {
    // The DM's scene text becomes the post body; the prompt is a post with no reply.
    return this.client.createPrompt(
      { title: input.title, ...(input.scene !== undefined ? { text: input.scene } : {}) },
      input.actingDid,
    );
  }

  async listReplies(promptUri: AtUri): Promise<AntiphonyReply[]> {
    return this.client.listReplies({ prompt: promptUri });
  }
}
