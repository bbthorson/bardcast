import { TID } from "@atproto/common-web";
import { cidForLex } from "@atproto/lex-cbor";
import {
  bringHome,
  chooseHistory,
  CharacterSheet,
  Collections,
  type HomeComing,
  type StrongRef,
} from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";
import type { SheetVersion } from "../ports/store.js";

/**
 * The player's sheet as a chain of immutable versions
 * (docs/character-creation.md, "Versions, not edits"). This module is the only
 * writer: each write is a new version whose `prev` is the current one, and the
 * profile's `sheet` ref moves forward to it. Nothing is ever updated in place.
 *
 * Refs are what the record will be once projected into the player's repo: the
 * rkey is a TID and the CID is the record's real dag-cbor CID (with `$type`),
 * so a seat's StrongRef stays valid when the record is published.
 */

/** Someone wrote a version since this one was read. Re-read and try again. */
export class StaleSheetError extends Error {
  constructor(characterId: string) {
    super(`${characterId}'s sheet has moved on since this version was based on it`);
    this.name = "StaleSheetError";
  }
}

export async function currentSheet(svc: CoreServices, characterId: string): Promise<SheetVersion | null> {
  const profile = await svc.store.getCharacter(characterId);
  return profile?.sheet ? svc.store.getSheetVersion(profile.sheet.uri) : null;
}

/**
 * Write a new version and make it current. Its `prev` must be the current
 * version (or absent, for a character's first sheet); otherwise another write
 * got there first and this one is refused rather than silently forking.
 */
export async function writeSheetVersion(svc: CoreServices, characterId: string, sheet: CharacterSheet): Promise<StrongRef> {
  const profile = await svc.store.getCharacter(characterId);
  if (!profile) throw new Error(`no character ${characterId}`);
  if ((sheet.prev?.uri ?? null) !== (profile.sheet?.uri ?? null)) throw new StaleSheetError(characterId);

  const valid = CharacterSheet.parse(sheet);
  // The record exactly as it would be written: no undefined fields, with $type.
  const record = { $type: Collections.characterSheet, ...JSON.parse(JSON.stringify(valid)) };
  const repo = profile.player ?? characterId;
  const ref: StrongRef = {
    uri: `at://${repo}/${Collections.characterSheet}/${TID.nextStr()}`,
    cid: (await cidForLex(record)).toString(),
  };
  await svc.store.putSheetVersion(characterId, ref, valid);
  await svc.store.putCharacter(characterId, { ...profile, sheet: ref });
  return ref;
}

/** The current version and everything before it, newest first, by following `prev`. */
export async function sheetHistory(svc: CoreServices, characterId: string): Promise<SheetVersion[]> {
  const history: SheetVersion[] = [];
  let next = await currentSheet(svc, characterId);
  while (next) {
    history.push(next);
    next = next.sheet.prev ? await svc.store.getSheetVersion(next.sheet.prev.uri) : null;
  }
  return history;
}

export interface BringProgressHomeInput {
  campaignId: string;
  characterId: string;
  /** Only needed when the histories diverged: which one the character keeps. */
  choice?: "table" | "owned";
}

/**
 * Carry a character's progress from a closed seat back to their own sheet:
 * levels earned at the table and the gear they carried out. An update is
 * written straight away; a divergence is returned for the player to choose,
 * and written once they have. The seat is never changed.
 */
export async function bringProgressHome(
  svc: CoreServices,
  input: BringProgressHomeInput,
): Promise<HomeComing & { written?: StrongRef }> {
  const [seat, current, profile] = await Promise.all([
    svc.store.getSeat(input.campaignId, input.characterId),
    currentSheet(svc, input.characterId),
    svc.store.getCharacter(input.characterId),
  ]);
  if (!seat || !current) return { kind: "nothing-new" };

  const home = {
    current: current.sheet,
    currentRef: current.ref,
    seatUri: `at://${input.campaignId}/${Collections.campaignSeat}/${profile?.player ?? input.characterId}`,
    now: svc.clock().toISOString(),
  };
  const result = bringHome(seat, home);
  if (result.kind === "update") {
    return { ...result, written: await writeSheetVersion(svc, input.characterId, result.sheet) };
  }
  if (result.kind === "diverged" && input.choice) {
    const chosen = chooseHistory(result, input.choice, home);
    if (chosen) return { ...result, written: await writeSheetVersion(svc, input.characterId, chosen) };
  }
  return result;
}
