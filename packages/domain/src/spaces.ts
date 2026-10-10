import { SpaceTypes } from "./nsid.js";

/**
 * Where Bardcast keeps audio on Antiphony: an atproto space (antiphony
 * specs/spaces.md). Bardcast's DID is every space's authority, so a space is
 * named by its type and key alone. Audio in a space is private: Antiphony plays
 * it only from signed links that expire within the hour.
 *
 * The type and key are sealed into every URI in the space, so neither may
 * change once a recording is kept. Both helpers below are the only place they
 * are decided.
 */
export interface SpaceKey {
  /** An NSID from `SpaceTypes`. */
  type: string;
  /** atproto record-key syntax. A DID or a local id (`campaign.thornwood`) is valid. */
  skey: string;
}

/** A campaign's space: the party's prompts and replies. Keyed by the campaign's stable local id. */
export function campaignSpace(campaignId: string): SpaceKey {
  return { type: SpaceTypes.campaign, skey: campaignId };
}

/** A player's own space: their character-creation recordings. Keyed by their DID. */
export function playerSpace(did: `did:${string}`): SpaceKey {
  return { type: SpaceTypes.player, skey: did };
}
