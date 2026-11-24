import type { VoiceProfile } from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";

/**
 * Voice clone lifecycle (docs/character-creation.md, docs/hosting.md).
 *
 * One voice profile per player (keyed by their DID), shared across every
 * character they bring to a table. Consent is a real, revocable gate: nothing
 * is sent to the VoiceCloner until the player explicitly consents, and
 * revocation deletes the provider-side model.
 */

export class VoiceError extends Error {
  constructor(
    message: string,
    readonly code: "conflict" | "invalid",
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

type PlayerDid = `did:${string}`;

const MAX_IVC_SAMPLES = 5;

/**
 * Resolve the voice profile for a character. A character owned by a player uses
 * that player's single DID-keyed voice profile; legacy/test characters without
 * an owning `player` DID fall back to a voice stored under `characterId`.
 */
export async function resolveCharacterVoice(svc: CoreServices, characterId: string): Promise<VoiceProfile | null> {
  const profile = await svc.store.getCharacter(characterId);
  if (profile?.player) {
    const byPlayer = await svc.store.getVoice(profile.player);
    if (byPlayer) return byPlayer;
  }
  return svc.store.getVoice(characterId);
}

/** Storage key for a character's voice profile (the player's DID when known). */
export async function voiceKeyForCharacter(svc: CoreServices, characterId: string): Promise<string> {
  const profile = await svc.store.getCharacter(characterId);
  return profile?.player ?? characterId;
}

export async function getVoiceProfile(svc: CoreServices, input: { did: PlayerDid }): Promise<VoiceProfile | null> {
  return svc.store.getVoice(input.did);
}

/** Record explicit consent. Safe to call repeatedly; keeps an active clone intact. */
export async function grantVoiceConsent(svc: CoreServices, input: { did: PlayerDid }): Promise<VoiceProfile> {
  const existing = await svc.store.getVoice(input.did);
  if (existing?.consent) return existing;
  const next: VoiceProfile = {
    status: "unlinked",
    consent: true,
    createdAt: existing?.createdAt ?? svc.clock().toISOString(),
  };
  await svc.store.putVoice(input.did, next);
  return next;
}

/** Link a user-owned ElevenLabs Professional Voice Clone via its private share link. */
export async function linkVoicePvc(
  svc: CoreServices,
  input: { did: PlayerDid; sharingLink: string },
): Promise<VoiceProfile> {
  const existing = await svc.store.getVoice(input.did);
  if (!existing?.consent) {
    throw new VoiceError("Consent is required before linking a voice clone.", "conflict");
  }
  const link = input.sharingLink.trim();
  if (!link) throw new VoiceError("A sharing link is required.", "invalid");

  const previousRef = existing.modelRef;
  const voiceId = await svc.voice.linkSharedPvc({ sharingLink: link });
  // If replacing an existing IVC, clean up the old clone so slots don't leak.
  if (previousRef && existing.status === "ivc" && previousRef !== voiceId) {
    await svc.voice.revoke(previousRef);
  }

  const next: VoiceProfile = {
    consent: true,
    status: "pvc",
    modelRef: voiceId,
    createdAt: existing.createdAt,
  };
  await svc.store.putVoice(input.did, next);
  return next;
}

export interface TrainVoiceIvcResult {
  profile: VoiceProfile;
  /** True when samples were available and an IVC now exists; false when waiting for the first audio recording. */
  trained: boolean;
  sampleCount: number;
}

/**
 * Train an Instant Voice Clone from the player's own Session Zero recordings
 * (if any exist in Antiphony). If the player hasn't recorded audio yet, leaves
 * consent active with status "unlinked" so their first campaign reply triggers
 * IVC creation automatically.
 */
export async function trainVoiceIvc(
  svc: CoreServices,
  input: { did: PlayerDid; force?: boolean },
): Promise<TrainVoiceIvcResult> {
  const existing = await svc.store.getVoice(input.did);
  if (!existing?.consent) {
    throw new VoiceError("Consent is required before training a voice clone.", "conflict");
  }
  if (!input.force && existing.status === "ivc" && existing.modelRef) {
    return { profile: existing, trained: true, sampleCount: 0 };
  }

  // Collect signed playback URLs from the player's spoken session-zero replies.
  const creations = await svc.store.listCreations(input.did);
  const replyUris: string[] = [];
  for (const { creation } of creations) {
    for (const turn of creation.turns) {
      if (turn.reply?.uri) replyUris.push(turn.reply.uri);
    }
  }

  const sampleAudioUrls: string[] = [];
  for (const uri of [...new Set(replyUris)].slice(0, MAX_IVC_SAMPLES)) {
    const url = await svc.antiphony.playbackUrl(uri).catch(() => undefined);
    if (url) sampleAudioUrls.push(url);
  }

  if (sampleAudioUrls.length === 0) {
    return { profile: existing, trained: false, sampleCount: 0 };
  }

  const previousRef = existing.status === "ivc" ? existing.modelRef : undefined;
  const voiceId = await svc.voice.createIvc({
    characterId: input.did,
    sampleAudioUrls,
  });
  if (previousRef && previousRef !== voiceId) {
    await svc.voice.revoke(previousRef);
  }

  const next: VoiceProfile = {
    consent: true,
    status: "ivc",
    modelRef: voiceId,
    createdAt: existing.createdAt,
  };
  await svc.store.putVoice(input.did, next);
  return { profile: next, trained: true, sampleCount: sampleAudioUrls.length };
}

/** Honour consent revocation: delete the provider-side model and unlink the profile. */
export async function revokeVoice(svc: CoreServices, input: { did: PlayerDid }): Promise<VoiceProfile> {
  const existing = await svc.store.getVoice(input.did);
  if (existing?.modelRef) {
    await svc.voice.revoke(existing.modelRef);
  }
  const next: VoiceProfile = {
    status: "unlinked",
    consent: false,
    createdAt: existing?.createdAt ?? svc.clock().toISOString(),
  };
  await svc.store.putVoice(input.did, next);
  return next;
}
