import type { AtUri, CampaignSeat } from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";
import { inferTraits, mergeTraits } from "./infer-traits.js";
import { partyOf } from "./seats.js";
import { resolveCharacterVoice, voiceKeyForCharacter } from "./voice.js";

export interface IngestRepliesInput {
  /** The campaign the prompt belongs to. The sheet these replies build is scoped to it. */
  campaignId: string;
  /** The character whose player authored the replies. */
  characterId: string;
  /** Antiphony prompt whose replies to pull. */
  antiphonyPromptUri: AtUri;
  /** The prompt's intent — which signal axis these replies primarily feed. */
  intent: "sheet" | "behavior" | "voice" | "story";
}

/**
 * Step 2 of the loop: fold a character's new audio replies into their derived
 * signal. Replies are the raw material for all three readiness axes.
 *
 * Updates provenance, infers sheet traits from transcripts through the
 * DecisionModel, accumulates behavior exemplars, and advances the voice clone.
 */
export async function ingestReplies(svc: CoreServices, input: IngestRepliesInput): Promise<void> {
  const [allReplies, profile] = await Promise.all([
    svc.antiphony.listReplies(input.antiphonyPromptUri),
    svc.store.getCharacter(input.characterId),
  ]);
  // Multi-player prompts carry replies from the whole table: only fold this
  // character's own player's replies into their seat, behavior, and voice.
  const replies = profile?.player
    ? allReplies.filter((r) => r.authorDid === profile.player)
    : allReplies;
  const replyUris = replies.map((r) => r.uri);
  const now = svc.clock().toISOString();

  // --- Seat: record provenance; infer traits from transcripts. ---
  // Campaign-scoped: replies to this campaign's prompts only shape this
  // campaign's seat. A character arriving with no seat gets an empty one; their
  // own sheet is never written here. Behavior and voice below are durable.
  if (input.intent === "sheet" || input.intent === "story") {
    const seat: CampaignSeat = (await svc.store.getSeat(input.campaignId, input.characterId)) ?? {
      campaign: `at://${input.campaignId}`,
      character: `at://${input.characterId}`,
      startingLevel: 1,
      startingItems: [],
      advancements: [],
      traits: [],
      sourceReplies: [],
      createdAt: now,
    };
    seat.sourceReplies = dedupe([...seat.sourceReplies, ...replyUris]);
    const transcripts = replies.map((r) => r.transcript).filter((t): t is string => Boolean(t));
    try {
      const inferred = await inferTraits(svc.decisions, { profile, transcripts });
      seat.traits = mergeTraits(seat.traits, inferred);
    } catch (err) {
      // Inference is best effort: a decision-model outage must not stop the
      // replies from feeding provenance, behavior, and voice. The next ingest
      // of this prompt re-reads the same replies and tries again.
      console.warn(`trait inference failed for ${input.characterId}:`, err);
    }
    // TODO(bardcast): infer drives too. They belong on the durable
    // CharacterProfile, not the seat.
    await svc.store.putSeat(input.campaignId, input.characterId, seat);
  }

  // --- Behavior: accumulate exemplar lines from transcripts. ---
  if (input.intent === "behavior" || input.intent === "story") {
    const behavior = (await svc.store.getBehavior(input.characterId)) ?? {
      modelRef: null,
      exemplars: [],
      sourceReplies: [],
      updatedAt: now,
    };
    const newExemplars = replies.map((r) => r.transcript).filter((t): t is string => Boolean(t));
    behavior.exemplars = dedupe([...behavior.exemplars, ...newExemplars]).slice(0, 256);
    behavior.sourceReplies = dedupe([...behavior.sourceReplies, ...replyUris]);
    behavior.updatedAt = now;
    await svc.store.putBehavior(input.characterId, behavior);
  }

  // --- Voice: feed reply audio to the cloner once to create an IVC. ---
  // Only train when consented and still unlinked so repeat ingests don't leak
  // provider voice slots.
  if (input.intent === "voice" || input.intent === "story") {
    const existing = await resolveCharacterVoice(svc, input.characterId);
    if (existing?.consent && existing.status === "unlinked") {
      const sampleAudioUrls = replies.map((r) => r.audioUrl).filter((u): u is string => Boolean(u));
      if (sampleAudioUrls.length > 0) {
        const voiceKey = await voiceKeyForCharacter(svc, input.characterId);
        const voiceId = await svc.voice.createIvc({
          characterId: voiceKey,
          sampleAudioUrls,
        });
        await svc.store.putVoice(voiceKey, {
          consent: true,
          status: "ivc",
          modelRef: voiceId,
          createdAt: existing.createdAt || now,
        });
      }
    }
  }
}

export interface SyncCampaignResult {
  promptsChecked: number;
  charactersSynced: number;
}

/**
 * Re-ingest every published prompt for every matching party member in a
 * campaign. Useful when Antiphony finishes async transcription after a player's
 * initial reply upload.
 */
export async function syncCampaignReplies(
  svc: CoreServices,
  input: { campaignId: string },
): Promise<SyncCampaignResult> {
  const [prompts, party] = await Promise.all([
    svc.store.listPrompts(input.campaignId),
    partyOf(svc, input.campaignId),
  ]);

  const synced = new Set<string>();
  for (const prompt of prompts) {
    if (!prompt.antiphonyPromptUri) continue;
    for (const member of party) {
      const targeted =
        prompt.audience.length === 0 ||
        prompt.audience.some((uri) => uri === `at://${member.id}` || uri === `at://${member.player}`);
      if (!targeted) continue;
      await ingestReplies(svc, {
        campaignId: input.campaignId,
        characterId: member.id,
        antiphonyPromptUri: prompt.antiphonyPromptUri,
        intent: prompt.intent ?? "story",
      });
      synced.add(member.id);
    }
  }

  return { promptsChecked: prompts.length, charactersSynced: synced.size };
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

