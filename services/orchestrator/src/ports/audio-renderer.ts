import type { ScriptLine } from "@bardcast/domain";

export interface RenderChapterInput {
  transcript: string;
  script?: ScriptLine[] | undefined;
  /** Maps a character id to the VoiceCloner modelRef that voices their lines. */
  voices: Record<string, string>;
  /** Voice/model for the DM-narrator portions. */
  narratorVoiceRef?: string | undefined;
}

export interface RenderLineInput {
  text: string;
  /** Voice/model to speak it in. Defaults to the adapter's narrator voice. */
  voiceRef?: string | undefined;
}

/**
 * One spoken line, as audio bytes. Not stored by the renderer: the caller
 * uploads it where it belongs (a narrator question goes into the player's
 * space with its prompt).
 */
export interface RenderedLine {
  audio: Blob;
  durationSeconds?: number;
}

export interface RenderedAudio {
  /** Blob ref / URL to the finished chapter audio. */
  audioRef: string;
  durationSeconds?: number;
}

/**
 * Turns a chapter transcript into multi-voice audio using the cloned voices.
 * First adapter is a TTS provider; long renders likely run as a background job.
 */
export interface AudioRenderer {
  render(input: RenderChapterInput): Promise<RenderedAudio>;
  /** Speak one line, e.g. a narrator question in session zero. */
  renderLine(input: RenderLineInput): Promise<RenderedLine>;
}
