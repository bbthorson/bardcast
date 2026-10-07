import type { CoreServices } from "./ports/index.js";
import {
  checkReadiness,
  currentSheet,
  generateChapter,
  ingestReplies,
  NotReadyError,
  publishPrompt,
  suggestPrompts,
} from "./use-cases/index.js";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { Campaign, Player } from "@bardcast/domain";
import { AtprotoIdentityProvider } from "./adapters/atproto/identity-provider.js";

const CreateCampaignSchema = z.object({
  title: z.string().min(1).max(200),
  premise: z.string().max(5000).optional(),
  calendar: z.string().max(80).optional(),
});

const PublishPromptSchema = z.object({
  title: z.string().min(1).max(300),
  scene: z.string().max(3000).optional(),
  audience: z.array(z.string()).default([]),
  audienceDids: z.array(z.string()).default([]),
  intent: z.enum(["sheet", "behavior", "voice", "story"]).default("story"),
  promptId: z.string().optional(),
  dmDid: z.string().optional(),
});

const IngestRepliesSchema = z.object({
  antiphonyPromptUri: z.string().startsWith("at://"),
  intent: z.enum(["sheet", "behavior", "voice", "story"]).default("story"),
});

const GenerateChapterSchema = z.object({
  characterIds: z.array(z.string()).min(1),
  directorNote: z.string().max(2000).optional(),
});

const JoinCampaignSchema = z.object({
  code: z.string().min(1).max(64),
});

async function resolvePlayer(c: Context, svc: CoreServices): Promise<Player | null> {
  const session = await svc.identity.resolveSession(c.req.raw.headers);
  if (session) return session;

  // Dev and test only: with real sign-in on, a header anyone can send must not
  // name the caller.
  if (svc.identity instanceof AtprotoIdentityProvider) return null;

  const actingDid = c.req.header("X-Acting-Did") || c.req.header("x-acting-did");
  if (actingDid && actingDid.startsWith("did:")) {
    return { did: actingDid as any, createdAt: new Date().toISOString() };
  }

  return null;
}

/**
 * The orchestrator's HTTP surface. One thin handler per use-case — validate,
 * delegate, serialize. No vendor SDKs directly; ports and adapters throughout.
 */
export function createApp(svc: CoreServices): Hono {
  const app = new Hono();

  // CORS middleware for web and player PWAs
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization", "X-Acting-Did", "Cookie"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );

  app.get("/healthz", (c) => c.json({ ok: true, service: "bardcast-orchestrator" }));

  // AT-Proto OAuth routes
  if (svc.identity instanceof AtprotoIdentityProvider) {
    app.route("/atproto", svc.identity.routes());
  }

  // --- Campaign Lifecycle Endpoints ------------------------------------------

  // List campaigns (filtered by user DID if authenticated)
  app.get("/api/campaigns", async (c) => {
    const player = await resolvePlayer(c, svc);
    const campaigns = await svc.store.listCampaigns(player ? { did: player.did } : undefined);
    return c.json({ campaigns });
  });

  // Create a new campaign (creator becomes DM)
  app.post("/api/campaigns", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to create a campaign." }, 401);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = CreateCampaignSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }

    const id = `campaign.${crypto.randomUUID().slice(0, 8)}`;
    const now = svc.clock().toISOString();

    const campaign: Campaign = {
      title: parsed.data.title,
      dm: player.did as any,
      ...(parsed.data.premise ? { premise: parsed.data.premise } : {}),
      ...(parsed.data.calendar ? { calendar: parsed.data.calendar } : {}),
      party: [],
      createdAt: now,
    };

    await svc.store.putCampaign(id, campaign);
    return c.json({ id, campaign }, 201);
  });

  // Get campaign details, party, and chapters
  app.get("/api/campaigns/:campaignId", async (c) => {
    const campaignId = c.req.param("campaignId");
    const campaign = await svc.store.getCampaign(campaignId);
    if (!campaign) {
      return c.json({ error: "not_found", message: `Campaign ${campaignId} not found` }, 404);
    }

    const chapters = await svc.store.listChapters(campaignId);
    const partyProfiles = await Promise.all(
      campaign.party.map(async (atUri) => {
        const charId = atUri.replace(/^at:\/\//, "");
        const profile = await svc.store.getCharacter(charId);
        return { id: charId, profile };
      }),
    );

    return c.json({ id: campaignId, campaign, chapters, party: partyProfiles });
  });

  // Generate an invite code for a campaign
  app.post("/api/campaigns/:campaignId/invites", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to generate an invite." }, 401);
    }

    const campaignId = c.req.param("campaignId");
    const campaign = await svc.store.getCampaign(campaignId);
    if (!campaign) {
      return c.json({ error: "not_found", message: `Campaign ${campaignId} not found` }, 404);
    }

    if (campaign.dm !== player.did) {
      return c.json({ error: "forbidden", message: "Only the campaign DM can create invites." }, 403);
    }

    const code = crypto.randomUUID().slice(0, 6).toUpperCase();
    await svc.store.createInvite(code, campaignId, player.did);
    return c.json({ code, campaignId }, 201);
  });

  // Join a campaign via invite code
  app.post("/api/campaigns/join", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to join a campaign." }, 401);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = JoinCampaignSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }

    const invite = await svc.store.getInvite(parsed.data.code);
    if (!invite) {
      return c.json({ error: "invalid_invite", message: "Invite code not found." }, 404);
    }

    const campaign = await svc.store.getCampaign(invite.campaignId);
    if (!campaign) {
      return c.json({ error: "not_found", message: "Campaign associated with invite no longer exists." }, 404);
    }

    const playerUri = `at://${player.did}` as const;
    if (!campaign.party.includes(playerUri as any)) {
      campaign.party.push(playerUri as any);
      await svc.store.putCampaign(invite.campaignId, campaign);
    }

    return c.json({ campaignId: invite.campaignId, campaign });
  });

  // Character detail within a campaign (profile + owned sheet + this campaign's seat + behavior + voice)
  app.get("/api/campaigns/:campaignId/characters/:characterId", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterId = c.req.param("characterId");

    const [profile, sheet, seat, behavior, voice] = await Promise.all([
      svc.store.getCharacter(characterId),
      currentSheet(svc, characterId).then((v) => v?.sheet ?? null),
      svc.store.getSeat(campaignId, characterId),
      svc.store.getBehavior(characterId),
      svc.store.getVoice(characterId),
    ]);

    if (!profile) {
      return c.json({ error: "not_found", message: `Character ${characterId} not found` }, 404);
    }

    return c.json({ characterId, profile, sheet, seat, behavior, voice });
  });

  // --- Step 1: List and publish prompts -------------------------------------
  app.get("/api/campaigns/:campaignId/prompts", async (c) => {
    const campaignId = c.req.param("campaignId");
    const prompts = await svc.store.listPrompts(campaignId);
    return c.json({ prompts });
  });

  app.post("/api/campaigns/:campaignId/prompts", async (c) => {
    const campaignId = c.req.param("campaignId");
    const raw = await c.req.json().catch(() => null);
    const parsed = PublishPromptSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }

    const player = await resolvePlayer(c, svc);
    const dmDid = (player?.did ?? parsed.data.dmDid ?? "did:example:dm") as `did:${string}`;

    const promptId = parsed.data.promptId ?? `prompt.${campaignId}.${crypto.randomUUID().slice(0, 8)}`;
    const prompt = await publishPrompt(svc, {
      campaignId,
      promptId,
      title: parsed.data.title,
      ...(parsed.data.scene !== undefined ? { scene: parsed.data.scene } : {}),
      dmDid,
      audience: parsed.data.audience,
      audienceDids: parsed.data.audienceDids as `did:${string}`[],
      intent: parsed.data.intent,
    });
    return c.json(prompt, 201);
  });

  // --- Step 2: Ingest replies into derived signal -----------------------------
  app.post("/api/campaigns/:campaignId/characters/:characterId/ingest", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterId = c.req.param("characterId");
    const raw = await c.req.json().catch(() => null);
    const parsed = IngestRepliesSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }

    await ingestReplies(svc, {
      campaignId,
      characterId,
      antiphonyPromptUri: parsed.data.antiphonyPromptUri as `at://${string}`,
      intent: parsed.data.intent,
    });
    return c.body(null, 204);
  });

  // --- Step 2b: Player sends an audio reply to a prompt -----------------------
  app.post("/api/campaigns/:campaignId/characters/:characterId/reply", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterId = c.req.param("characterId");

    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to post a reply." }, 401);
    }

    const contentType = c.req.header("content-type") || "";
    let audioBlob: Blob | null = null;
    let promptUri = "";
    let intent: "sheet" | "behavior" | "voice" | "story" = "story";
    let text: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("audio");
      if (file instanceof Blob) {
        audioBlob = file;
      }
      promptUri = (form.get("promptUri") as string) || "";
      const rawIntent = form.get("intent") as string | null;
      if (rawIntent === "sheet" || rawIntent === "behavior" || rawIntent === "voice" || rawIntent === "story") {
        intent = rawIntent;
      }
      text = (form.get("text") as string) || undefined;
    } else {
      const body = (await c.req.json().catch(() => null)) as {
        promptUri?: string;
        intent?: "sheet" | "behavior" | "voice" | "story";
        text?: string;
        audioBase64?: string;
        mimeType?: string;
      } | null;
      if (body) {
        promptUri = body.promptUri || "";
        intent = body.intent || "story";
        text = body.text;
        if (body.audioBase64) {
          const buffer = Buffer.from(body.audioBase64, "base64");
          audioBlob = new Blob([buffer], { type: body.mimeType || "audio/webm" });
        }
      }
    }

    if (!audioBlob) {
      return c.json({ error: "validation_failed", message: "audio file is required" }, 400);
    }
    if (!promptUri || !promptUri.startsWith("at://")) {
      return c.json({ error: "validation_failed", message: "promptUri must be an at:// URI" }, 400);
    }

    // Post to Antiphony via gateway
    const replyUri = await svc.antiphony.createReply({
      promptUri: promptUri as any,
      audioBlob,
      actingDid: player.did as any,
      ...(text ? { text } : {}),
    });

    // Ingest into character signal
    await ingestReplies(svc, {
      campaignId,
      characterId,
      antiphonyPromptUri: promptUri as any,
      intent,
    });

    return c.json({ success: true, replyUri }, 201);
  });

  // --- Step 3: Readiness gate query ------------------------------------------
  app.get("/api/campaigns/:campaignId/readiness", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterIds = c.req.queries("character") ?? [];
    const readiness = await checkReadiness(svc, { campaignId, characterIds });
    return c.json(readiness);
  });

  // --- Step 4: Generate a chapter --------------------------------------------
  app.post("/api/campaigns/:campaignId/chapters", async (c) => {
    const campaignId = c.req.param("campaignId");
    const raw = await c.req.json().catch(() => null);
    const parsed = GenerateChapterSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }

    try {
      const result = await generateChapter(svc, {
        campaignId,
        characterIds: parsed.data.characterIds,
        ...(parsed.data.directorNote ? { directorNote: parsed.data.directorNote } : {}),
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof NotReadyError) {
        return c.json({ error: "not_ready", blocking: err.blocking }, 409);
      }
      throw err;
    }
  });

  // --- Step 5: Suggest prompts -----------------------------------------------
  app.get("/api/campaigns/:campaignId/suggested-prompts", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterIds = c.req.queries("character") ?? [];
    const suggestions = await suggestPrompts(svc, { campaignId, characterIds });
    return c.json({ suggestions });
  });

  return app;
}
