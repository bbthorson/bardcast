import type { DeliverablePrompt, EngagementChannel, ReplyNotice } from "../port.js";

export interface PwaChannelOptions {
  /** Where the orchestrator exposes its engagement webhooks/endpoints. */
  apiBaseUrl: string;
  /** Sends a Web Push notification to a player's subscribed devices. */
  sendPush: (input: { to: string; title: string; body: string; url: string }) => Promise<void>;
  /** Resolves a DID to a deep link into the player PWA for this prompt. */
  promptUrl: (promptRef: string) => string;
}

/**
 * PWA engagement channel — the live-ish first surface. Delivers a prompt by
 * sending a Web Push notification deep-linking into the player PWA, where the
 * player records a reply (which posts to vox-pop-core). Reply notices arrive via
 * the orchestrator's webhook, surfaced through `emit`.
 *
 * TODO(bardcast): wire `sendPush` to a real Web Push provider (VAPID), and route
 * the orchestrator's vox-pop reply webhook into `emit`.
 */
export class PwaEngagementChannel implements EngagementChannel {
  readonly kind = "pwa";
  private handlers = new Set<(n: ReplyNotice) => void>();

  constructor(private readonly opts: PwaChannelOptions) {}

  async deliverPrompt(prompt: DeliverablePrompt): Promise<void> {
    await Promise.all(
      prompt.audience.map((did) =>
        this.opts.sendPush({
          to: did,
          title: "Your turn, adventurer",
          body: prompt.title,
          url: this.opts.promptUrl(prompt.promptRef),
        }),
      ),
    );
  }

  onReply(handler: (notice: ReplyNotice) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Called by the orchestrator's reply webhook. */
  emit(notice: ReplyNotice): void {
    for (const h of this.handlers) h(notice);
  }
}
