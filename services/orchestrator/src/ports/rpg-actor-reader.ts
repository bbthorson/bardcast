import type { RpgActorProfile } from "@bardcast/domain";

/**
 * Read-only port for fetching a player's public `rpg.actor` records
 * (`actor.rpg.stats`, `actor.rpg.sprite`, and verified `equipment.rpg.item`s).
 *
 * Requires no OAuth write scopes: all rpg.actor records live publicly on the
 * player's PDS and in the rpg.actor compendium index.
 */
export interface RpgActorReader {
  readActor(did: `did:${string}`): Promise<RpgActorProfile | null>;
}
