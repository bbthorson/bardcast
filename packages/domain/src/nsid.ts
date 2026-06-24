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
  chapter: nsid("campaign.chapter"),
  voiceProfile: nsid("voice.profile"),
} as const;

export type CollectionId = (typeof Collections)[keyof typeof Collections];
