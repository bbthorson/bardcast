import type {
  AudioRenderer,
  RenderChapterInput,
  RenderedAudio,
  RenderedLine,
  RenderLineInput,
} from "../ports/audio-renderer.js";

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

  /** Silent placeholder bytes, so prompts still carry audio offline. */
  async renderLine(input: RenderLineInput): Promise<RenderedLine> {
    return {
      audio: new Blob([new TextEncoder().encode(`stub-audio:${input.text}`)], { type: "audio/mpeg" }),
      durationSeconds: Math.ceil(input.text.length / 15),
    };
  }
}
