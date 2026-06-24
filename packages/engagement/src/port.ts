import type { AtUri, Did } from "@bardcast/domain";

/**
 * EngagementChannel — the seam between Bardcast and wherever the players
 * actually are. The orchestrator hands a prompt to a channel; the channel is
 * responsible for getting it in front of the right players and signalling when
 * replies arrive. The decision "PWA vs Bluesky communities" is a choice of
 * adapter, not a change to the loop.
 *
 * The audio reply payload itself always lives in vox-pop-core; a channel deals
 * in delivery + notification, and returns vox-pop reply AT-URIs.
 */

export interface DeliverablePrompt {
  /** Bardcast prompt AT-URI (or local id pre-publish). */
  promptRef: string;
  /** The vox-pop prompt the player will reply to. */
  voxPopPromptUri: AtUri;
  title: string;
  scene?: string;
  /** DIDs of the players this prompt is aimed at. */
  audience: Did[];
}

export interface ReplyNotice {
  promptRef: string;
  voxPopReplyUri: AtUri;
  player: Did;
  receivedAt: string;
}

export interface EngagementChannel {
  /** Stable identifier for the adapter, e.g. "pwa" | "bluesky". */
  readonly kind: string;

  /** Push a prompt to its audience. Resolves once accepted for delivery. */
  deliverPrompt(prompt: DeliverablePrompt): Promise<void>;

  /**
   * Subscribe to reply notices for this channel. Returns an unsubscribe fn.
   * Implementations may back this with web-push callbacks, a webhook, or polling.
   */
  onReply(handler: (notice: ReplyNotice) => void): () => void;
}
