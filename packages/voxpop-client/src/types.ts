import { z } from "zod";

/**
 * Minimal shapes for the slice of the vox-pop-core API Bardcast uses: creating
 * prompts and reading their asynchronous replies. These mirror the public
 * contract documented at docs.voxpop.phonicfactory.com and the lexicons
 * com.voxpop.audio.prompt / com.voxpop.actor.profile.
 *
 * TODO(bardcast): generate these from vox-pop-core's committed openapi.json
 * (apps/core-api/openapi.json) instead of hand-maintaining them.
 */

export const VoxPopPromptStatus = z.enum(["live", "archived"]);
export type VoxPopPromptStatus = z.infer<typeof VoxPopPromptStatus>;

export const VoxPopPrompt = z.object({
  uri: z.string(),
  title: z.string(),
  description: z.string().optional(),
  audioUrl: z.string().url().optional(),
  status: VoxPopPromptStatus,
  createdAt: z.string(),
});
export type VoxPopPrompt = z.infer<typeof VoxPopPrompt>;

export const VoxPopReply = z.object({
  uri: z.string(),
  promptUri: z.string(),
  author: z.string().describe("DID or actor id of the replier"),
  audioUrl: z.string().url().optional(),
  transcript: z.string().optional(),
  createdAt: z.string(),
});
export type VoxPopReply = z.infer<typeof VoxPopReply>;

export const CreatePromptInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(3000).optional(),
  /** Audio of the DM speaking the prompt. Provide one of audioBlob | audioUrl. */
  audioBlob: z.instanceof(Blob).optional(),
  audioUrl: z.string().url().optional(),
});
export type CreatePromptInput = z.infer<typeof CreatePromptInput>;

export interface ListRepliesQuery {
  promptUri: string;
  cursor?: string;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  cursor?: string;
}
