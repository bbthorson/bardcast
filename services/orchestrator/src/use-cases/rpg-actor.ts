import { TID } from "@atproto/common-web";
import {
  CharacterProfile,
  Collections,
  Creation,
  fromRpgActorDndStats,
  toRpgActorBardcastStats,
  toRpgActorDndStats,
  type AbilityScores,
  type CharacterSheet,
  type RpgActorImportDraft,
  type RpgActorProfile,
  type SrdClass,
  type StrongRef,
} from "@bardcast/domain";
import type { CoreServices, RpgActorWriteResult } from "../ports/index.js";
import { currentSheet, writeSheetVersion } from "./sheets.js";

export type RpgActorErrorCode = "unavailable" | "not_found" | "forbidden" | "invalid";

export class RpgActorImportError extends Error {
  constructor(
    readonly code: RpgActorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RpgActorImportError";
  }
}

export interface RpgActorLookupResult {
  actor: RpgActorProfile | null;
  importDraft: RpgActorImportDraft | null;
}

/**
 * Look up a DID's public `rpg.actor` presence (D&D stats, sprite + emotes,
 * verified equipment) and derive a Bardcast import draft if D&D stats exist.
 */
export async function lookupRpgActor(
  svc: CoreServices,
  did: `did:${string}`,
  opts: { displayName?: string } = {},
): Promise<RpgActorLookupResult> {
  if (!svc.rpgActor) return { actor: null, importDraft: null };
  const actor = await svc.rpgActor.readActor(did);
  if (!actor) return { actor: null, importDraft: null };
  const importDraft = actor.dnd ? fromRpgActorDndStats(actor.dnd, opts) : null;
  return { actor, importDraft };
}

export interface ImportRpgActorInput {
  playerDid: `did:${string}`;
  /** Character name in Bardcast (required; falls back to player handle if provided). */
  displayName: string;
  /** Optional player overrides — the player always has final say over their sheet. */
  class?: SrdClass;
  abilities?: AbilityScores;
  species?: string;
  background?: string;
  concept?: string;
  pronouns?: string;
  drives?: string[];
  quirks?: string[];
}

export interface ImportedRpgActorCharacter {
  characterId: string;
  profile: CharacterProfile;
  sheet: CharacterSheet;
  sheetRef: StrongRef;
  notes: string[];
}

/**
 * Import a player's `actor.rpg.stats/dnd` record into Bardcast as a new
 * player-owned `CharacterProfile` and initial immutable `CharacterSheet`
 * version (written via `writeSheetVersion`).
 *
 * State drives derived records: this copies the player's rpg.actor D&D stats
 * as a starting point and never mutates their PDS.
 */
export async function importRpgActorCharacter(
  svc: CoreServices,
  input: ImportRpgActorInput,
): Promise<ImportedRpgActorCharacter> {
  if (!svc.rpgActor) {
    throw new RpgActorImportError("unavailable", "rpg.actor reader is not configured.");
  }

  const actor = await svc.rpgActor.readActor(input.playerDid);
  if (!actor?.dnd) {
    throw new RpgActorImportError("not_found", "No actor.rpg.stats D&D record found for this account.");
  }

  const draft = fromRpgActorDndStats(actor.dnd, { displayName: input.displayName });
  const chosenClass = input.class ?? draft.class;
  if (!chosenClass) {
    throw new RpgActorImportError(
      "invalid",
      "Your rpg.actor class isn't in SRD 5.2; choose a class to finish importing.",
    );
  }

  const now = svc.clock().toISOString();
  const rkey = TID.nextStr();
  const characterId = `char.${rkey}`;
  const profileUri = `at://${input.playerDid}/${Collections.characterProfile}/${rkey}`;

  const profile = CharacterProfile.parse({
    player: input.playerDid,
    displayName: input.displayName.trim(),
    ...(input.concept ?? draft.concept ? { concept: (input.concept ?? draft.concept)!.trim() } : {}),
    ...(input.pronouns ? { pronouns: input.pronouns.trim() } : {}),
    drives: input.drives ?? draft.drives,
    createdAt: now,
  });

  await svc.store.putCharacter(characterId, profile);

  const species = input.species ?? draft.species;
  const background = input.background ?? draft.background;

  const sheet: CharacterSheet = {
    character: profileUri,
    class: chosenClass,
    ...(species ? { species } : {}),
    ...(background ? { background } : {}),
    abilities: input.abilities ?? draft.abilities,
    features: draft.features,
    advancements: [],
    traits: [],
    quirks: input.quirks ?? draft.quirks,
    equipment: draft.equipment,
    createdAt: now,
  };

  const sheetRef = await writeSheetVersion(svc, characterId, sheet);
  const savedProfile = (await svc.store.getCharacter(characterId)) ?? { ...profile, sheet: sheetRef };

  // Record a confirmed Creation so `charactersOf()` and the JoinInvite picker
  // list this character alongside session-zero characters.
  const creation = Creation.parse({
    player: input.playerDid,
    status: "confirmed",
    turns: [],
    settled: {
      class: { value: chosenClass, by: "player", at: now },
      ...(species ? { species: { value: species, by: "player", at: now } } : {}),
      ...(background ? { background: { value: background, by: "player", at: now } } : {}),
    },
    name: { confirmed: savedProfile.displayName },
    character: characterId,
    createdAt: now,
    updatedAt: now,
  });
  await svc.store.putCreation(`creation.${rkey}`, creation);

  return {
    characterId,
    profile: savedProfile,
    sheet,
    sheetRef,
    notes: draft.notes,
  };
}

export type RpgActorSyncTarget = "dnd" | "bardcast";

export interface SyncRpgActorInput {
  playerDid: `did:${string}`;
  characterId: string;
  /** Which per-system `actor.rpg.stats/<system>` records to project. Defaults to both `dnd` and `bardcast`. */
  targets?: RpgActorSyncTarget[];
}

export interface SyncedRpgActorResult {
  characterId: string;
  synced: RpgActorWriteResult[];
}

/**
 * Project one of the player's own Bardcast characters to their AT Protocol PDS
 * under `actor.rpg.stats/dnd` and/or `actor.rpg.stats/bardcast`.
 *
 * Opt-in per character: Bardcast allows multiple characters per player while
 * `actor.rpg.stats/<system>` is one record per system per DID.
 */
export async function syncCharacterToRpgActor(
  svc: CoreServices,
  input: SyncRpgActorInput,
): Promise<SyncedRpgActorResult> {
  if (!svc.rpgActorWriter) {
    throw new RpgActorImportError(
      "unavailable",
      "Syncing to rpg.actor requires an AT Protocol sign-in session.",
    );
  }

  const [profile, sheetVersion] = await Promise.all([
    svc.store.getCharacter(input.characterId),
    currentSheet(svc, input.characterId),
  ]);
  if (!profile || !sheetVersion) {
    throw new RpgActorImportError("not_found", `Character ${input.characterId} has no saved sheet to sync.`);
  }
  if (profile.player !== input.playerDid) {
    throw new RpgActorImportError("forbidden", "You can only sync your own character to rpg.actor.");
  }

  const targets: RpgActorSyncTarget[] =
    input.targets && input.targets.length > 0 ? input.targets : ["dnd", "bardcast"];
  const now = svc.clock().toISOString();
  const synced: RpgActorWriteResult[] = [];

  for (const target of targets) {
    const data =
      target === "dnd"
        ? (toRpgActorDndStats(profile, sheetVersion.sheet) as Record<string, unknown>)
        : toRpgActorBardcastStats(profile, sheetVersion.sheet);
    const written = await svc.rpgActorWriter.putSystemStats({
      did: input.playerDid,
      system: target,
      data,
      now,
    });
    synced.push(written);
  }

  return { characterId: input.characterId, synced };
}
