import { z } from "zod";
import { Did, IsoDateTime } from "./ids.js";

/** The two human roles in a campaign. */
export const Role = z.enum(["dm", "player"]);
export type Role = z.infer<typeof Role>;

/**
 * A person, authenticated via AT-Protocol. The DID is the durable key.
 * AT-Proto OAuth is Bardcast's responsibility (Antiphony is headless and holds
 * no user data) — see the IdentityProvider port in services/orchestrator.
 */
export const Player = z.object({
  did: Did,
  handle: z.string().max(253).optional(),
  displayName: z.string().max(120).optional(),
  createdAt: IsoDateTime,
});
export type Player = z.infer<typeof Player>;
