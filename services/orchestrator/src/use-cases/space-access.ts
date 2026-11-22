import { SpaceTypes, type SpaceRefParts } from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";

/** `com.atproto.managedspace.checkAccess`'s answer. */
export interface SpaceAccess {
  read: boolean;
  write: boolean;
}

const NONE: SpaceAccess = { read: false, write: false };
const MEMBER: SpaceAccess = { read: true, write: true };

/**
 * Bardcast's answer, as the managing app of its spaces, to "may this account
 * read or write this space?" (`com.atproto.managedspace.checkAccess`).
 *
 *  - A campaign's space: its DM and its party, both read and write (the DM
 *    posts prompts; players post replies).
 *  - A player's space: that player alone.
 *  - Without `repo`, the host is asking about public reads. None of Bardcast's
 *    spaces is public.
 *  - A space Bardcast isn't the authority of, or doesn't know: no access.
 *
 * Only a definite answer comes back as `{ read: false, write: false }`. A
 * failure (the store is down) throws, and the host reports that as
 * `UpstreamFailure`, which nobody takes for a loss of access.
 *
 * The space's authority itself never reaches here: hosts authorize it under
 * every policy. Bardcast writes as the authority (chapters, the narrator).
 *
 * `clientId` (the OAuth client the account is using) is not checked: any app a
 * member uses may read what the member may read. TODO(bardcast): decide whether
 * campaign audio is readable only through Bardcast's own client.
 */
export async function checkSpaceAccess(
  svc: CoreServices,
  input: { space: SpaceRefParts; appDid: string; repo?: string; clientId?: string },
): Promise<SpaceAccess> {
  const { space, repo } = input;
  // TODO(bardcast): a table's DID, once campaigns are spaces under tables (ROADMAP.md).
  if (space.authority !== input.appDid || !repo) return NONE;

  switch (space.spaceType) {
    case SpaceTypes.campaign: {
      const campaign = await svc.store.getCampaign(space.skey);
      if (!campaign) return NONE;
      return campaign.dm === repo || campaign.party.includes(`at://${repo}`) ? MEMBER : NONE;
    }
    case SpaceTypes.player:
      return space.skey === repo ? MEMBER : NONE;
    default:
      return NONE;
  }
}
