import { z } from "zod";

/**
 * Identity model. Mirrors supper_club_secrets/protocol/ARCHITECTURE.md §7:
 * stable local IDs are the durable internal key; each graduates to a DID.
 *
 * - LocalId  — a human-readable stable key (`char.elara`, `campaign.thornwood`).
 *              Never changes even if a display name or file does.
 * - Did      — the AT-Protocol decentralized identifier the LocalId maps to.
 *
 * Characters, sheets, and voice profiles hang off the player's Did so a
 * character can follow its player across campaigns ("portable canon").
 */

export const LocalId = z
  .string()
  .regex(/^[a-z]+\.[a-z0-9-]+$/, "LocalId must look like 'kind.slug', e.g. 'char.elara'");
export type LocalId = z.infer<typeof LocalId>;

export const Did = z
  .string()
  .regex(/^did:[a-z]+:[A-Za-z0-9._:%-]+$/, "Must be a valid DID, e.g. 'did:plc:abc123'");
export type Did = z.infer<typeof Did>;

/** An AT-URI pointing at a record, e.g. at://did:plc:abc/game.bardcast.campaign.chapter/3k2a. */
export const AtUri = z.string().startsWith("at://");
export type AtUri = z.infer<typeof AtUri>;

export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/**
 * An in-world date. A PLAIN STRING on purpose — fantasy calendars don't fit a
 * real datetime. Ordering is carried by a record's real `createdAt`, never by
 * this field. See ARCHITECTURE.md §8.
 */
export const StoryDate = z.string().max(80);
export type StoryDate = z.infer<typeof StoryDate>;

/**
 * The bridge between the three views of one identity (file ↔ record ↔ DID).
 * The in-app registry of LocalId → Did, analogous to entities.yaml.
 */
export const EntityBinding = z.object({
  localId: LocalId,
  did: Did.optional(),
});
export type EntityBinding = z.infer<typeof EntityBinding>;
