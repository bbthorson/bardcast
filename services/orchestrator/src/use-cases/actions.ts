import { TID } from "@atproto/common-web";
import { applyActions, CampaignAction, Collections, playSeat } from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";

/**
 * The campaign's action log (docs/character-creation.md, "Actions"). Actions
 * are committed once a chapter is finished, never while it's drafted, so a
 * branch the story engine backtracked out of never reaches the log. Each
 * commit then refreshes every seat's state snapshot from the whole log.
 */

export interface CommitChapterActionsInput {
  campaignId: string;
  /** AT-URI of the finished chapter. */
  chapter: string;
  /** In the order they happened. */
  actions: Array<Omit<CampaignAction, "campaign" | "chapter" | "createdAt">>;
}

export async function commitChapterActions(svc: CoreServices, input: CommitChapterActionsInput): Promise<string[]> {
  const createdAt = svc.clock().toISOString();
  // Validate the whole chapter before writing any of it.
  const actions = input.actions.map((a) =>
    CampaignAction.parse({ ...a, campaign: `at://${input.campaignId}`, chapter: input.chapter, createdAt }),
  );
  const uris: string[] = [];
  for (const action of actions) {
    // TIDs are time-ordered, so actions sharing a createdAt keep their order.
    const uri = `at://${input.campaignId}/${Collections.campaignAction}/${TID.nextStr()}`;
    await svc.store.putAction(input.campaignId, uri, action);
    uris.push(uri);
  }
  await refreshSeatStates(svc, input.campaignId);
  return uris;
}

/**
 * Replay the log onto every seat that has a sheet. The snapshot is derived:
 * running this twice gives the same state, and the log is what to trust.
 */
export async function refreshSeatStates(svc: CoreServices, campaignId: string): Promise<void> {
  const [seats, log] = await Promise.all([svc.store.listSeats(campaignId), svc.store.listActions(campaignId)]);
  const actions = log.map((entry) => entry.action);
  for (const { characterId, seat } of seats) {
    const played = playSeat(seat);
    if (!played) continue; // no sheet brought yet, so nothing to keep score on
    const state = applyActions({
      character: seat.character,
      maxHitPoints: played.maxHitPoints,
      startingItems: seat.startingItems,
      actions,
    });
    await svc.store.putSeat(campaignId, characterId, { ...seat, state });
  }
}

/**
 * The character leaves the table, or the campaign ends. After this the player
 * can bring their levels and gear home (bringProgressHome).
 */
export async function closeSeat(svc: CoreServices, campaignId: string, characterId: string): Promise<void> {
  const seat = await svc.store.getSeat(campaignId, characterId);
  if (!seat) throw new Error(`no seat for ${characterId} at ${campaignId}`);
  if (seat.closedAt) return;
  await svc.store.putSeat(campaignId, characterId, { ...seat, closedAt: svc.clock().toISOString() });
}
