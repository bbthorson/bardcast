import { Collections, RpgActorCollections } from "@bardcast/domain";
import { pdsServesMethod, type ConditionalScope } from "@bbthorson/atproto-cf-auth/server";
import { RepoPermission, RpcPermission, SpacePermission } from "@atproto/oauth-scopes";

/**
 * What Bardcast asks a player's PDS for at sign-in.
 *
 * Built from the NSID constants, so they follow `NSID_ROOT` when the
 * placeholder is swapped, and printed by `@atproto/oauth-scopes` (pinned to the
 * Spaces alpha) rather than spelled by hand: the library writes each scope in
 * its canonical form, with the Spaces beta's parameter names (`spaceType`, not
 * `type`), and `scopes.test.ts` checks every one parses and grants what Bardcast
 * needs. Changing a scope asks every player to consent again at their next
 * sign-in.
 */

const ownRepo = (collection: string) => new RepoPermission([collection as `${string}.${string}.${string}`], ["create", "update", "delete"]).toString();
const anyHost = (lxm: string) => new RpcPermission("*", [lxm as `${string}.${string}.${string}`]).toString();

/**
 * Asked at every sign-in: identity, plus writing the character into the
 * player's own repo (its profile, the chain of sheet versions, its voice
 * profile, and optional opt-in projection to `actor.rpg.stats`).
 */
export const BARDCAST_SCOPE = [
  "atproto",
  ownRepo(Collections.characterProfile),
  ownRepo(Collections.characterSheet),
  ownRepo(Collections.voiceProfile),
  ownRepo(RpgActorCollections.stats),
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
 *    space (any table's: `authority=*`, any key), in their own repo. Read, and
 *    create/update/delete of `fyi.opensocial.acceptance` only. The library
 *    prints it as `space:fyi.opensocial.members?authority=*&collection=…`: the
 *    key (`*`) and the actions (read, create, update, delete) are its defaults,
 *    so it leaves them out. It grants the same as the hand-written
 *    `…&skey=*&…&action=read&action=create&action=update&action=delete`.
 *
 * TODO(bardcast): add the campaign and player space scopes
 * (`space:${SpaceTypes.campaign}?…`, `space:${SpaceTypes.player}?…`) once the
 * NSID root is a domain Bardcast controls. A PDS has to resolve a space type's
 * lexicon to grant a scope for it, and nobody can publish one under the
 * placeholder `game.bardcast`, so asking now would fail sign-in on exactly the
 * PDSes that serve spaces. Build them with `SpacePermission` like the members
 * scope below, and declare the space types with `title` (not `name`)
 * (docs/spaces-beta-readiness.md).
 */
export const BARDCAST_CONDITIONAL_SCOPES: ConditionalScope[] = [
  {
    scope: [
      anyHost("fyi.opensocial.provisionGroup"),
      anyHost("fyi.opensocial.createSpace"),
      anyHost("fyi.opensocial.requestJoin"),
      anyHost("fyi.opensocial.leaveGroup"),
      new SpacePermission(
        "fyi.opensocial.members",
        "*",
        "*",
        ["fyi.opensocial.acceptance"],
        ["read", "create", "update", "delete"],
        undefined,
      ).toString(),
    ].join(" "),
    when: servesSpaces,
  },
];
