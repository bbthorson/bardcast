import { newMasterSeed, type Chapter, type CharacterStateEvent, type ReadinessThresholds } from "@bardcast/domain";
import type { CoreServices, NarrativeCharacter } from "../ports/index.js";
import { checkReadiness } from "./check-readiness.js";
import { resolveCharacterVoice } from "./voice.js";

export interface GenerateChapterInput {
  campaignId: string;
  characterIds: string[];
  directorNote?: string;
  /** Optional readiness gate override (e.g. lower thresholds during a closed playtest). */
  thresholds?: ReadinessThresholds;
}

export class NotReadyError extends Error {
  constructor(readonly blocking: { characterId: string; nextFocus: unknown }[]) {
    super("Party is not ready to generate a chapter.");
    this.name = "NotReadyError";
  }
}

/**
 * Step 4 of the loop: generate a chapter. Enforces the readiness gate, then
 * walks the pipeline — writing → rendering → ready — persisting the Chapter at
 * each transition so the DM sees "audio is processing" (status writing|rendering)
 * and then the finished audio. Emits character.stateEvent beats as a side effect
 * (the derived, backdated arc).
 *
 * Returned `events` are the beats to project into stateEvent records.
 */
export async function generateChapter(
  svc: CoreServices,
  input: GenerateChapterInput,
): Promise<{ chapter: Chapter; chapterId: string; events: CharacterStateEvent[] }> {
  const readiness = await checkReadiness(svc, {
    campaignId: input.campaignId,
    characterIds: input.characterIds,
    ...(input.thresholds ? { thresholds: input.thresholds } : {}),
  });
  if (!readiness.ready) throw new NotReadyError(readiness.blocking);

  const campaign = await svc.store.getCampaign(input.campaignId);
  if (!campaign) throw new Error(`Unknown campaign ${input.campaignId}`);

  const prior = await svc.store.listChapters(input.campaignId);
  const index = prior.length + 1;
  const chapterId = `chapter.${input.campaignId}.${index}`;
  const now = () => svc.clock().toISOString();

  // Assemble the ready party for the writer.
  const characters: NarrativeCharacter[] = [];
  const voiceRefs: Record<string, string> = {};
  for (const id of input.characterIds) {
    const profile = await svc.store.getCharacter(id);
    if (!profile) continue;
    const [seat, behavior, voice, rpgActor] = await Promise.all([
      svc.store.getSeat(input.campaignId, id),
      svc.store.getBehavior(id),
      resolveCharacterVoice(svc, id),
      svc.rpgActor && profile.player
        ? svc.rpgActor.readActor(profile.player as `did:${string}`).catch(() => null)
        : Promise.resolve(null),
    ]);
    const keepsakes = rpgActor?.equipment.filter((item) => item.verified);
    characters.push({
      id,
      profile,
      seat,
      behavior,
      ...(keepsakes && keepsakes.length > 0 ? { keepsakes } : {}),
    });
    if (voice?.modelRef) voiceRefs[id] = voice.modelRef;
  }

  // If the DM linked a narrator voice clone, let ElevenLabs narrate in it.
  const dmVoice = await svc.store.getVoice(campaign.dm);
  const narratorVoiceRef = dmVoice?.consent && dmVoice.modelRef ? dmVoice.modelRef : undefined;

  // --- writing ---
  let chapter: Chapter = {
    campaign: `at://${input.campaignId}`,
    index,
    title: `Chapter ${index}`,
    script: [],
    status: "writing",
    seed: newMasterSeed(),
    rollLog: [],
    beats: [],
    createdAt: now(),
  };
  await svc.store.putChapter(chapterId, chapter);

  const written = await svc.narrative.writeChapter({
    campaign,
    characters,
    priorChapters: prior.map((c) => c.transcript ?? "").filter(Boolean),
    ...(input.directorNote !== undefined ? { directorNote: input.directorNote } : {}),
  });

  // --- rendering ---
  chapter = {
    ...chapter,
    title: written.title,
    transcript: written.transcript,
    script: written.script ?? [],
    ...(written.storyDate !== undefined ? { storyDate: written.storyDate } : {}),
    status: "rendering",
  };
  await svc.store.putChapter(chapterId, chapter);

  const rendered = await svc.audio.render({
    transcript: written.transcript,
    script: written.script,
    voices: voiceRefs,
    ...(narratorVoiceRef ? { narratorVoiceRef } : {}),
    campaignId: input.campaignId,
    chapterId,
  });

  // --- ready ---
  chapter = { ...chapter, audioRef: rendered.audioRef, status: "ready" };
  await svc.store.putChapter(chapterId, chapter);

  const events: CharacterStateEvent[] = written.beats.map((b) => ({
    subject: `at://${b.characterId}`,
    state: b.state,
    storyDate: b.storyDate,
    chapterRef: `at://${chapterId}`,
    createdAt: now(),
  }));

  return { chapter, chapterId, events };
}
