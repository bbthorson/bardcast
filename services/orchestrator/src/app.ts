import type { CoreServices } from "./ports/index.js";
import {
  checkReadiness,
  generateChapter,
  ingestReplies,
  NotReadyError,
  publishPrompt,
  suggestPrompts,
} from "./use-cases/index.js";
import { Hono } from "hono";
import { AtprotoIdentityProvider } from "./adapters/atproto/identity-provider.js";

/**
 * The orchestrator's HTTP surface. One thin handler per use-case — validate,
 * delegate, serialize. No business logic lives here (it's in use-cases), no
 * vendor SDKs (they're behind ports). Mirrors vox-pop-core's "Hono handlers
 * talking to typed services" shape.
 *
 * TODO(bardcast): Zod-validate request bodies and gate writes behind
 * svc.identity.resolveSession before delegating.
 */
export function createApp(svc: CoreServices): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true, service: "bardcast-orchestrator" }));

  // Bardcast's own AT-Proto OAuth (login/callback/client-metadata), mounted only
  // when the atproto identity adapter is in use. Self-contained — no vox-pop dep.
  if (svc.identity instanceof AtprotoIdentityProvider) {
    app.route("/atproto", svc.identity.routes());
  }

  // Step 1 — DM publishes a prompt (creates the vox-pop prompt + delivers it).
  app.post("/api/campaigns/:campaignId/prompts", async (c) => {
    const campaignId = c.req.param("campaignId");
    const body = await c.req.json();
    const prompt = await publishPrompt(svc, { campaignId, ...body });
    return c.json(prompt, 201);
  });

  // Step 2 — fold a character's replies into their derived signal.
  app.post("/api/characters/:characterId/ingest", async (c) => {
    const characterId = c.req.param("characterId");
    const body = await c.req.json();
    await ingestReplies(svc, { characterId, ...body });
    return c.body(null, 204);
  });

  // Step 3 — the readiness gate (DM console polls this).
  app.get("/api/campaigns/:campaignId/readiness", async (c) => {
    const characterIds = c.req.queries("character") ?? [];
    const readiness = await checkReadiness(svc, { characterIds });
    return c.json(readiness);
  });

  // Step 4 — generate a chapter (audio "processing" → ready).
  app.post("/api/campaigns/:campaignId/chapters", async (c) => {
    const campaignId = c.req.param("campaignId");
    const body = await c.req.json();
    try {
      const result = await generateChapter(svc, { campaignId, ...body });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof NotReadyError) {
        return c.json({ error: "not_ready", blocking: err.blocking }, 409);
      }
      throw err;
    }
  });

  // Step 5 — suggest the DM new prompts to keep the quest moving.
  app.get("/api/campaigns/:campaignId/suggested-prompts", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterIds = c.req.queries("character") ?? [];
    const suggestions = await suggestPrompts(svc, { campaignId, characterIds });
    return c.json({ suggestions });
  });

  return app;
}
