export interface RenderChapterInput {
  transcript: string;
  /** Maps a character id to the VoiceCloner modelRef that voices their lines. */
  voices: Record<string, string>;
  /** Voice/model for the DM-narrator portions. */
  narratorVoiceRef?: string;
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
}
