import type { AtUri } from "@bardcast/domain";
import type { AntiphonyPrompt, AntiphonyReply } from "@bardcast/antiphony-client";

/**
 * The loop's view of the Antiphony engine. Wraps @bardcast/antiphony-client so
 * use-cases depend on this small interface, not the concrete HTTP client —
 * keeps them unit-testable and the engine swappable.
 *
 * `actingDid` is the player the post is attributed to: Antiphony stamps it onto
 * the record's `authorDid` (via the acting-actor headers). A prompt is authored
 * by the DM; every post is tied to a DID.
 */
export interface AntiphonyGateway {
  createPrompt(input: { title: string; scene?: string; actingDid: `did:${string}` }): Promise<AntiphonyPrompt>;
  listReplies(promptUri: AtUri): Promise<AntiphonyReply[]>;
}
