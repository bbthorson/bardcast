import { newMasterSeed, type Chapter, type CharacterStateEvent } from "@bardcast/domain";
import type { CoreServices, NarrativeCharacter } from "../ports/index.js";
import { checkReadiness } from "./check-readiness.js";

export interface GenerateChapterInput {
  campaignId: string;
  characterIds: string[];
  directorNote?: string;
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
  const readiness = await checkReadiness(svc, { characterIds: input.characterIds });
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
    const [sheet, behavior, voice] = await Promise.all([
      svc.store.getSheet(id),
      svc.store.getBehavior(id),
      svc.store.getVoice(id),
    ]);
    characters.push({ id, profile, sheet, behavior });
    if (voice?.modelRef) voiceRefs[id] = voice.modelRef;
  }

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
    ...(written.storyDate !== undefined ? { storyDate: written.storyDate } : {}),
    status: "rendering",
  };
  await svc.store.putChapter(chapterId, chapter);

  const rendered = await svc.audio.render({ transcript: written.transcript, voices: voiceRefs });

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
