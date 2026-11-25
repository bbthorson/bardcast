export type RpgActorWriteErrorCode = "unauthorized" | "scope_missing" | "upstream";

export class RpgActorWriteError extends Error {
  constructor(
    readonly code: RpgActorWriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RpgActorWriteError";
  }
}

export interface RpgActorWriteResult {
  uri: string;
  cid: string;
  system: string;
}

/**
 * Write port for projecting a player's chosen Bardcast character to their own
 * PDS under `actor.rpg.stats/<system>` (e.g. `dnd`, `bardcast`).
 *
 * State drives derived records: this only projects Bardcast's current sheet
 * when the player explicitly asks to sync.
 */
export interface RpgActorWriter {
  putSystemStats(input: {
    did: `did:${string}`;
    system: string;
    data: Record<string, unknown>;
    now: string;
  }): Promise<RpgActorWriteResult>;
}
