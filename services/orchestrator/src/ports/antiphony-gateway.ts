import type { AtUri, SpaceKey } from "@bardcast/domain";
import type { AntiphonyPrompt, AntiphonyReply } from "@bardcast/antiphony-client";

/**
 * The loop's view of the Antiphony engine. Wraps @bardcast/antiphony-client so
 * use-cases depend on this small interface, not the concrete HTTP client —
 * keeps them unit-testable and the engine swappable.
 *
 * `actingDid` is the player the post is attributed to: Antiphony stamps it onto
 * the record's `authorDid` (via the acting-actor headers). A prompt is authored
 * by the DM; every post is tied to a DID.
 *
 * Every recording lives in a space (antiphony specs/spaces.md): a campaign's
 * prompts and replies in `campaignSpace`, a player's creation recordings in
 * `playerSpace`. Audio in a space plays only from signed links that expire
 * within the hour, so an `audioUrl` read here is used at once, never stored.
 */
export interface AntiphonyGateway {
  /**
   * Make sure a space exists before anything is posted into it. Idempotent,
   * so it is safe to call before every write.
   */
  ensureSpace(space: SpaceKey): Promise<void>;
  /** Publish a prompt into `space`. Its replies land in the same space. */
  createPrompt(input: { title: string; scene?: string; actingDid: `did:${string}`; space: SpaceKey }): Promise<AntiphonyPrompt>;
  listReplies(promptUri: AtUri): Promise<AntiphonyReply[]>;
  /** Reply to a prompt. The reply, and its audio, go in the prompt's space. */
  createReply(input: {
    promptUri: AtUri;
    promptCid?: string;
    audioBlob: Blob;
    actingDid: `did:${string}`;
    text?: string;
  }): Promise<string>;
}
