import type { CoreServices } from "../ports/index.js";

export interface IngestRepliesInput {
  /** The character whose player authored the replies. */
  characterId: string;
  /** vox-pop prompt whose replies to pull. */
  voxPopPromptUri: `at://${string}`;
  /** The prompt's intent — which signal axis these replies primarily feed. */
  intent: "sheet" | "behavior" | "voice" | "story";
}

/**
 * Step 2 of the loop: fold a character's new audio replies into their derived
 * signal. Replies are the raw material for all three readiness axes.
 *
 * This scaffold updates provenance + accumulates raw material and advances the
 * voice clone. The actual INFERENCE (transcript → traits, behavior exemplars)
 * is delegated and marked TODO — it likely calls an LLM and/or the VoiceCloner.
 */
export async function ingestReplies(svc: CoreServices, input: IngestRepliesInput): Promise<void> {
  const replies = await svc.antiphony.listReplies(input.voxPopPromptUri);
  const replyUris = replies.map((r) => r.uri as `at://${string}`);
  const now = svc.clock().toISOString();

  // --- Sheet: record provenance; infer traits from transcripts. ---
  if (input.intent === "sheet" || input.intent === "story") {
    const sheet = (await svc.store.getSheet(input.characterId)) ?? {
      traits: [],
      drives: [],
      sourceReplies: [],
      createdAt: now,
    };
    sheet.sourceReplies = dedupe([...sheet.sourceReplies, ...replyUris]);
    // TODO(bardcast): infer traits/drives from reply transcripts (LLM) and
    // merge with confidence scoring before persisting.
    await svc.store.putSheet(input.characterId, sheet);
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
  // --- Voice: feed reply audio to the cloner to generate or update the IVC. ---
  if (input.intent === "voice" || input.intent === "story") {
    const existing = await svc.store.getVoice(input.characterId);
    if (existing?.consent && existing.status !== "pvc") {
      const sampleAudioUrls = replies.map((r) => r.audioUri).filter((u): u is string => Boolean(u));
      if (sampleAudioUrls.length > 0) {
        const voiceId = await svc.voice.createIvc({
          characterId: input.characterId,
          sampleAudioUrls,
        });
        await svc.store.putVoice(input.characterId, {
          consent: true,
          status: "ivc",
          modelRef: voiceId,
          createdAt: existing.createdAt || now,
        });
      }
    }
  }
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

