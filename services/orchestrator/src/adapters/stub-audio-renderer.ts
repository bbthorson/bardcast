import type { AudioRenderer, RenderChapterInput, RenderedAudio } from "../ports/audio-renderer.js";

/**
 * Stub AudioRenderer — returns a fake audio ref instead of synthesizing speech.
 * TODO(bardcast): real adapter that renders the transcript to multi-voice audio
 * via a TTS provider using the per-character cloned-voice modelRefs, likely as a
 * background job that updates the chapter to `ready` on completion.
 */
export class StubAudioRenderer implements AudioRenderer {
  async render(input: RenderChapterInput): Promise<RenderedAudio> {
    const voiceCount = Object.keys(input.voices).length;
    return {
      audioRef: `stub-audio://chapter/${Date.now()}?voices=${voiceCount}`,
      durationSeconds: Math.ceil(input.transcript.length / 15),
    };
  }
}
