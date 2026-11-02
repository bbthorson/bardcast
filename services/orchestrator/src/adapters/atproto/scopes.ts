import { Collections } from "@bardcast/domain";
import { pdsServesMethod, type ConditionalScope } from "@bbthorson/atproto-cf-auth/server";

/**
 * What Bardcast asks a player's PDS for at sign-in.
 *
 * Built from the NSID constants, so they follow `NSID_ROOT` when the
 * placeholder is swapped. Changing a scope asks every player to consent again
 * at their next sign-in.
 */

/**
 * Asked at every sign-in: identity, plus writing the character into the
 * player's own repo (its profile, the chain of sheet versions, and its voice
 * profile), which is theirs (docs/character-model.md). Nothing writes there yet;
 * the scopes come first so that the first write doesn't need a second consent.
 */
export const BARDCAST_SCOPE = [
  "atproto",
  `repo:${Collections.characterProfile}`,
  `repo:${Collections.characterSheet}`,
  `repo:${Collections.voiceProfile}`,
].join(" ");

/**
 * Whether the player's PDS serves spaces: a member reads a group's spaces with
 * a delegation token their own PDS mints. Grain gates its group scopes on the
 * same method (Antiphony specs/audio-service-and-groups.md).
 */
const servesSpaces = pdsServesMethod("com.atproto.space.getDelegationToken");

/**
 * Tables as atmospheric groups (the opensocial.group model), asked for only on
 * a PDS that serves spaces: a space scope asked of one that doesn't fails the
 * whole sign-in, and a player whose PDS can't hold a table's spaces can't take
 * part in one anyway.
 *
 *  - Calls to a table's group host, with service auth the player's PDS mints:
 *    founding a table (`provisionGroup`), opening its spaces (`createSpace`),
 *    joining and leaving. Any host, hence `aud=*`.
 *  - The player's half of membership: their acceptance, in the table's members
 *    space, in their own repo.
 *
 * TODO(bardcast): add the campaign and player space scopes
 * (`space:${SpaceTypes.campaign}?…`, `space:${SpaceTypes.player}?…`) once the
 * NSID root is a domain Bardcast controls. A PDS has to resolve a space type's
 * lexicon to grant a scope for it, and nobody can publish one under the
 * placeholder `game.bardcast`, so asking now would fail sign-in on exactly the
 * PDSes that serve spaces.
 */
export const BARDCAST_CONDITIONAL_SCOPES: ConditionalScope[] = [
  {
    scope: [
      "rpc:fyi.opensocial.provisionGroup?aud=*",
      "rpc:fyi.opensocial.createSpace?aud=*",
      "rpc:fyi.opensocial.requestJoin?aud=*",
      "rpc:fyi.opensocial.leaveGroup?aud=*",
      [
        "space:fyi.opensocial.members?authority=*&skey=*",
        "collection=fyi.opensocial.acceptance",
        "action=read&action=create&action=update&action=delete",
      ].join("&"),
    ].join(" "),
    when: servesSpaces,
  },
];
