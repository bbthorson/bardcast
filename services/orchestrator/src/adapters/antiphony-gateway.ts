import type { AtUri, SpaceKey } from "@bardcast/domain";
import { AntiphonyClient, type AntiphonyPrompt, type AntiphonyReply } from "@bardcast/antiphony-client";
import type { AntiphonyGateway } from "../ports/antiphony-gateway.js";

/**
 * Default AntiphonyGateway adapter: wraps the real @bardcast/antiphony-client
 * (Antiphony Core API). The gateway is the narrow port the use-cases see; the
 * client is the HTTP detail.
 */
export class ClientAntiphonyGateway implements AntiphonyGateway {
  /** Spaces already put by this instance; the PUT is idempotent, so this only saves round trips. */
  private readonly ensured = new Set<string>();

  constructor(private readonly client: AntiphonyClient) {}

  async ensureSpace(space: SpaceKey): Promise<void> {
    const id = `${space.type}/${space.skey}`;
    if (this.ensured.has(id)) return;
    // Bardcast is the managing app of every space it makes: it decides who
    // hears what, and hands out the signed links accordingly.
    await this.client.putSpace(space, { readPolicy: "managing-app", writePolicy: "managing-app" });
    this.ensured.add(id);
  }

  async createPrompt(input: {
    title: string;
    scene?: string;
    actingDid: `did:${string}`;
    space: SpaceKey;
  }): Promise<AntiphonyPrompt> {
    await this.ensureSpace(input.space);
    // The DM's scene text becomes the post body; the prompt is a post with no reply.
    return this.client.createPrompt(
      { title: input.title, ...(input.scene !== undefined ? { text: input.scene } : {}), space: input.space },
      input.actingDid,
    );
  }

  async listReplies(promptUri: AtUri): Promise<AntiphonyReply[]> {
    return this.client.listReplies({ prompt: promptUri });
  }

  async createReply(input: {
    promptUri: AtUri;
    promptCid?: string;
    audioBlob: Blob;
    actingDid: `did:${string}`;
    text?: string;
  }): Promise<string> {
    return this.client.createReply(
      {
        prompt: { uri: input.promptUri, cid: input.promptCid ?? "bafyplaceholder" },
        audio: { blob: input.audioBlob },
        ...(input.text !== undefined ? { text: input.text } : {}),
      },
      input.actingDid,
    );
  }
}
