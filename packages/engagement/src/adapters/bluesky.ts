import type { DeliverablePrompt, EngagementChannel, ReplyNotice } from "../port.js";

/**
 * Bluesky private-communities engagement channel — STUB.
 *
 * The bet: host the call/response inside a Bluesky private community so the
 * interaction lives natively in the AT-Proto identity graph the characters
 * already inhabit. Bluesky communities + group chat are unreleased and
 * undocumented as of this scaffold, so this adapter only fixes the shape.
 *
 * When the community/group-chat lexicons land, implement:
 *  - deliverPrompt: post the prompt into the community thread / group chat.
 *  - onReply: subscribe to the community firehose (Jetstream) filtered to
 *    members' audio replies, mapping each to a ReplyNotice.
 *
 * TODO(bardcast): implement against the real Bluesky communities API once it
 * ships. Until then, deliverPrompt throws so it can't be silently selected.
 */
export class BlueskyEngagementChannel implements EngagementChannel {
  readonly kind = "bluesky";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deliverPrompt(_prompt: DeliverablePrompt): Promise<void> {
    throw new Error(
      "BlueskyEngagementChannel is a stub: Bluesky communities API is not yet available.",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onReply(_handler: (notice: ReplyNotice) => void): () => void {
    return () => {};
  }
}
