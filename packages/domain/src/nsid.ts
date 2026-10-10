/**
 * The single source of truth for the AT-Protocol lexicon namespace.
 *
 * `game.bardcast` is a PLACEHOLDER. Before publishing any record to a PDS, swap
 * this for a domain you control (reverse-DNS, e.g. `com.yourdomain.bardcast`).
 * Everything else derives from this constant, so it is a one-line change.
 *
 * See README.md "The NSID namespace is a placeholder" and
 * supper_club_secrets/protocol/ARCHITECTURE.md §5.
 */
export const NSID_ROOT = "game.bardcast" as const;

/** Build a fully-qualified NSID under the Bardcast root, e.g. nsid("character.profile"). */
export function nsid(suffix: string): string {
  return `${NSID_ROOT}.${suffix}`;
}

/** The record collections Bardcast reads and writes. */
export const Collections = {
  characterProfile: nsid("character.profile"),
  characterSheet: nsid("character.sheet"),
  characterStateEvent: nsid("character.stateEvent"),
  campaign: nsid("campaign.campaign"),
  campaignSeat: nsid("campaign.seat"),
  campaignAction: nsid("campaign.action"),
  chapter: nsid("campaign.chapter"),
  voiceProfile: nsid("voice.profile"),
} as const;

export type CollectionId = (typeof Collections)[keyof typeof Collections];

/**
 * The atproto space types Bardcast creates on Antiphony (antiphony
 * specs/spaces.md). A space type is sealed into every URI in the space, so
 * swap NSID_ROOT before the first kept one.
 */
export const SpaceTypes = {
  /** One per campaign; skey: the campaign's stable local id (`campaign.thornwood`). Semi-private: the party. */
  campaign: nsid("space.campaign"),
  /**
   * One per player; skey: the player's DID. Private: that player only. Holds
   * their character-creation recordings, and is created when they start their
   * first character (antiphony atproto-authority-model.md D6).
   */
  player: nsid("space.player"),
} as const;
