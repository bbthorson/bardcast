import type { Prompt } from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";

export interface PublishPromptInput {
  promptId: string;
  campaignId: string;
  title: string;
  scene?: string;
  /** The DM authoring the prompt — the post is tied to this DID in Antiphony. */
  dmDid: `did:${string}`;
  /** Character ids the prompt targets. */
  audience: string[];
  audienceDids: `did:${string}`[];
  intent?: Prompt["intent"];
}

/**
 * Step 1 of the loop: the DM publishes a prompt. We create the backing audio
 * prompt in vox-pop-core, persist the Bardcast Prompt with the link, then hand
 * it to the engagement channel for delivery to the players.
 */
export async function publishPrompt(svc: CoreServices, input: PublishPromptInput): Promise<Prompt> {
  const vp = await svc.antiphony.createPrompt({
    title: input.title,
    ...(input.scene !== undefined ? { scene: input.scene } : {}),
    actingDid: input.dmDid,
  });

  const prompt: Prompt = {
    campaign: `at://${input.campaignId}`,
    title: input.title,
    ...(input.scene !== undefined ? { scene: input.scene } : {}),
    audience: input.audience.map((id) => `at://${id}`),
    intent: input.intent ?? "story",
    voxPopPromptUri: vp.uri,
    createdAt: svc.clock().toISOString(),
  };
  await svc.store.putPrompt(input.promptId, prompt);

  await svc.engagement.deliverPrompt({
    promptRef: input.promptId,
    voxPopPromptUri: vp.uri,
    title: input.title,
    ...(input.scene !== undefined ? { scene: input.scene } : {}),
    audience: input.audienceDids,
  });

  return prompt;
}
