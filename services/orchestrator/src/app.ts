import type { CoreServices } from "./ports/index.js";
import {
  advanceCreation,
  answerCreation,
  charactersOf,
  checkReadiness,
  confirmCharacter,
  confirmName,
  CreationError,
  currentSheet,
  getCreation,
  getVoiceProfile,
  grantVoiceConsent,
  linkVoicePvc,
  listCreations,
  pickAttribute,
  proposeCharacter,
  questionAudio,
  resolveCharacterVoice,
  reviseLine,
  revokeVoice,
  startCreation,
  syncCampaignReplies,
  trainVoiceIvc,
  VoiceError,
  generateChapter,
  ingestReplies,
  NotReadyError,
  partyOf,
  SeatError,
  takeSeat,
  publishPrompt,
  suggestPrompts,
  checkSpaceAccess,
} from "./use-cases/index.js";
import { ServiceAuthError } from "./ports/index.js";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  AbilityScores,
  AtUri,
  BackgroundIncreases,
  campaignSpace,
  Did,
  isRecordUri,
  managingAppRef,
  parseSpaceRef,
  ReadinessThresholds,
  type Campaign,
  type Player,
} from "@bardcast/domain";
import { AtprotoIdentityProvider } from "./adapters/atproto/identity-provider.js";
import { chapterAudioKey } from "./adapters/r2-audio-storage.js";

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
  antiphonyPromptUri: AtUri,
  intent: z.enum(["sheet", "behavior", "voice", "story"]).default("story"),
});

const GenerateChapterSchema = z.object({
  characterIds: z.array(z.string()).min(1),
  directorNote: z.string().max(2000).optional(),
  thresholds: ReadinessThresholds.optional(),
});

const LinkPvcSchema = z.object({
  sharingLink: z.string().min(1).max(500),
});

const TrainIvcSchema = z.object({
  force: z.boolean().optional(),
});

const VOICE_ERROR_STATUS = { conflict: 409, invalid: 400 } as const;

const JoinCampaignSchema = z.object({
  code: z.string().min(1).max(64),
  /** The character to bring. Without it the player joins the party and picks one later. */
  characterId: z.string().min(1).max(128).optional(),
});

const TakeSeatSchema = z.object({ characterId: z.string().min(1).max(128) });

const SEAT_ERROR_STATUS = { not_found: 404, forbidden: 403, conflict: 409 } as const;

const PickAttributeSchema = z.object({ attribute: z.string().min(1).max(40), value: z.string().min(1).max(60) });
const ConfirmNameSchema = z.object({ name: z.string().min(1).max(120) });
const ReviseLineSchema = z.object({
  line: z.discriminatedUnion("field", [
    z.object({ field: z.literal("concept") }),
    z.object({ field: z.literal("quote") }),
    z.object({ field: z.literal("quirk"), index: z.number().int().min(0) }),
    z.object({ field: z.literal("drive"), index: z.number().int().min(0) }),
  ]),
});
const ConfirmCharacterSchema = z.object({
  abilities: AbilityScores,
  backgroundIncreases: BackgroundIncreases,
});

const CREATION_ERROR_STATUS = { not_found: 404, forbidden: 403, conflict: 409, invalid: 400 } as const;

async function resolvePlayer(c: Context, svc: CoreServices): Promise<Player | null> {
  const session = await svc.identity.resolveSession(c.req.raw.headers);
  if (session) return session;

  // Dev and test only: with real sign-in on, a header anyone can send must not
  // name the caller.
  if (svc.identity instanceof AtprotoIdentityProvider) return null;

  const actingDid = c.req.header("X-Acting-Did") || c.req.header("x-acting-did");
  if (actingDid && actingDid.startsWith("did:")) {
    return { did: actingDid, createdAt: new Date().toISOString() };
  }

  return null;
}

/** The method a space host calls on its managing app (Spaces, November 12 protocol). */
const CHECK_ACCESS = "com.atproto.managedspace.checkAccess";

/** An XRPC error body: `{ error, message }`, which atproto clients read. */
function xrpcError(c: Context, status: 400 | 401 | 403 | 500 | 501, error: string, message: string) {
  return c.json({ error, message }, status);
}

/** We couldn't answer (the store, or the issuer's DID document): a failure, never a denial. */
function couldNotDecide(c: Context, err: unknown) {
  console.error(`${CHECK_ACCESS} could not decide:`, err);
  return xrpcError(c, 500, "InternalServerError", "could not decide");
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

  // --- Bardcast as a managing app (atproto Spaces) ----------------------------

  /**
   * `com.atproto.managedspace.checkAccess`: a space host asks whether an
   * account may read or write a space that names Bardcast as its managing app
   * (`com.atproto.managedspace.policy`). Service auth only, signed as the
   * space's authority, with `aud` = Bardcast's `managingApp` reference and
   * `lxm` = this method.
   *
   * Only 200 is an answer. Every other status, and a timeout, the host reports
   * as `UpstreamFailure`, which is not a denial: so this route never answers
   * `{ read: false, write: false }` for anything but a decision.
   */
  app.get(`/xrpc/${CHECK_ACCESS}`, async (c) => {
    const managing = svc.managingApp;
    if (!managing) return xrpcError(c, 501, "MethodNotImplemented", "Bardcast manages no spaces here yet");

    const auth = c.req.header("authorization");
    if (!auth?.startsWith("Bearer ")) return xrpcError(c, 401, "AuthenticationRequired", "service auth required");
    let iss: string;
    try {
      ({ iss } = await managing.serviceAuth.verify(auth.slice("Bearer ".length), {
        aud: managingAppRef(managing.appDid),
        lxm: CHECK_ACCESS,
      }));
    } catch (err) {
      if (err instanceof ServiceAuthError) return xrpcError(c, 401, err.code, err.message);
      return couldNotDecide(c, err);
    }

    const space = parseSpaceRef(c.req.query("space") ?? "");
    if (!space) return xrpcError(c, 400, "InvalidRequest", "space must be a space reference");
    const repo = c.req.query("repo");
    if (repo !== undefined && !Did.safeParse(repo).success) return xrpcError(c, 400, "InvalidRequest", "repo must be a DID");
    // Only the space's own authority (its host signs as it) may ask about it.
    if (iss !== space.authority) return xrpcError(c, 403, "NotAuthorized", "only the space's authority may check access to it");

    const clientId = c.req.query("clientId");
    try {
      return c.json(
        await checkSpaceAccess(svc, {
          space,
          appDid: managing.appDid,
          ...(repo !== undefined ? { repo } : {}),
          ...(clientId !== undefined ? { clientId } : {}),
        }),
      );
    } catch (err) {
      return couldNotDecide(c, err);
    }
  });

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
      dm: player.did,
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
    // Each player and the character they brought (found through their seat).
    const party = (await partyOf(svc, campaignId)).map(({ player, id, profile }) => ({ player, id, profile }));

    return c.json({ id: campaignId, campaign, chapters, party });
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

    if (parsed.data.characterId) {
      try {
        const seated = await takeSeat(svc, {
          campaignId: invite.campaignId,
          did: player.did as `did:${string}`,
          characterId: parsed.data.characterId,
        });
        return c.json({ campaignId: invite.campaignId, campaign: await svc.store.getCampaign(invite.campaignId), ...seated });
      } catch (err) {
        if (err instanceof SeatError) return c.json({ error: err.code, message: err.message }, SEAT_ERROR_STATUS[err.code]);
        throw err;
      }
    }

    const playerUri = `at://${player.did}` as const;
    if (!campaign.party.includes(playerUri)) {
      campaign.party.push(playerUri);
      await svc.store.putCampaign(invite.campaignId, campaign);
    }

    return c.json({ campaignId: invite.campaignId, campaign });
  });

  // What an invite leads to, so a player can choose who to bring before joining.
  app.get("/api/invites/:code", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    const invite = await svc.store.getInvite(c.req.param("code").trim().toUpperCase());
    const campaign = invite ? await svc.store.getCampaign(invite.campaignId) : null;
    if (!invite || !campaign) return c.json({ error: "invalid_invite", message: "Invite code not found." }, 404);
    return c.json({
      campaignId: invite.campaignId,
      title: campaign.title,
      startingLevel: campaign.startingLevel ?? 1,
      ...(campaign.characterGuidance ? { characterGuidance: campaign.characterGuidance } : {}),
    });
  });

  // Bring a character to a table you're already at (joined before choosing one).
  app.post("/api/campaigns/:campaignId/seat", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    const parsed = TakeSeatSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    const campaignId = c.req.param("campaignId");
    const campaign = await svc.store.getCampaign(campaignId);
    if (!campaign?.party.includes(`at://${player.did}` as never)) {
      return c.json({ error: "forbidden", message: "Join this table with an invite first." }, 403);
    }
    try {
      return c.json(await takeSeat(svc, { campaignId, did: player.did as `did:${string}`, characterId: parsed.data.characterId }), 201);
    } catch (err) {
      if (err instanceof SeatError) return c.json({ error: err.code, message: err.message }, SEAT_ERROR_STATUS[err.code]);
      throw err;
    }
  });

  // The signed-in player's characters that can take a seat.
  app.get("/api/characters", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    return c.json({ characters: await charactersOf(svc, player.did) });
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
      resolveCharacterVoice(svc, characterId),
    ]);

    if (!profile) {
      return c.json({ error: "not_found", message: `Character ${characterId} not found` }, 404);
    }

    return c.json({ characterId, profile, sheet, seat, behavior, voice });
  });

  // --- Voice clone lifecycle (keyed by signed-in player DID) -----------------
  app.get("/api/voice", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    const profile = await getVoiceProfile(svc, { did: player.did as `did:${string}` });
    return c.json({ profile });
  });

  app.post("/api/voice/consent", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    const profile = await grantVoiceConsent(svc, { did: player.did as `did:${string}` });
    return c.json({ profile });
  });

  app.post("/api/voice/pvc", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    const raw = await c.req.json().catch(() => null);
    const parsed = LinkPvcSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }
    try {
      const profile = await linkVoicePvc(svc, {
        did: player.did as `did:${string}`,
        sharingLink: parsed.data.sharingLink,
      });
      return c.json({ profile });
    } catch (err) {
      if (err instanceof VoiceError) {
        return c.json({ error: err.code, message: err.message }, VOICE_ERROR_STATUS[err.code]);
      }
      throw err;
    }
  });

  app.post("/api/voice/ivc", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    const raw = await c.req.json().catch(() => ({}));
    const parsed = TrainIvcSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }
    try {
      const result = await trainVoiceIvc(svc, {
        did: player.did as `did:${string}`,
        ...(parsed.data.force !== undefined ? { force: parsed.data.force } : {}),
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof VoiceError) {
        return c.json({ error: err.code, message: err.message }, VOICE_ERROR_STATUS[err.code]);
      }
      throw err;
    }
  });

  app.delete("/api/voice", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
    const profile = await revokeVoice(svc, { did: player.did as `did:${string}` });
    return c.json({ profile });
  });

  // --- Step 1: List and publish prompts -------------------------------------
  app.get("/api/campaigns/:campaignId/prompts", async (c) => {
    const campaignId = c.req.param("campaignId");
    const prompts = await svc.store.listPrompts(campaignId);
    return c.json({ prompts });
  });

  app.post("/api/campaigns/:campaignId/prompts", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to publish a prompt." }, 401);
    }

    const campaignId = c.req.param("campaignId");
    const campaign = await svc.store.getCampaign(campaignId);
    if (!campaign) {
      return c.json({ error: "not_found", message: `Campaign ${campaignId} not found` }, 404);
    }
    if (campaign.dm !== player.did) {
      return c.json({ error: "forbidden", message: "Only the campaign DM can publish prompts." }, 403);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = PublishPromptSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }

    const dmDid = player.did as `did:${string}`;
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
  app.post("/api/campaigns/:campaignId/sync", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to sync replies." }, 401);
    }
    const campaignId = c.req.param("campaignId");
    const campaign = await svc.store.getCampaign(campaignId);
    if (!campaign) {
      return c.json({ error: "not_found", message: `Campaign ${campaignId} not found` }, 404);
    }
    if (campaign.dm !== player.did) {
      return c.json({ error: "forbidden", message: "Only the campaign DM can sync campaign replies." }, 403);
    }
    const result = await syncCampaignReplies(svc, { campaignId });
    return c.json(result);
  });

  app.post("/api/campaigns/:campaignId/characters/:characterId/ingest", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to ingest replies." }, 401);
    }
    const campaignId = c.req.param("campaignId");
    const characterId = c.req.param("characterId");
    const [campaign, profile] = await Promise.all([
      svc.store.getCampaign(campaignId),
      svc.store.getCharacter(characterId),
    ]);
    if (!campaign) {
      return c.json({ error: "not_found", message: `Campaign ${campaignId} not found` }, 404);
    }
    const isOwner = profile?.player ? profile.player === player.did : characterId === player.did;
    if (campaign.dm !== player.did && !isOwner) {
      return c.json({ error: "forbidden", message: "Only the DM or the character's player can ingest replies." }, 403);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = IngestRepliesSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
    }

    await ingestReplies(svc, {
      campaignId,
      characterId,
      antiphonyPromptUri: parsed.data.antiphonyPromptUri,
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

    const profile = await svc.store.getCharacter(characterId);
    if (profile?.player && profile.player !== player.did) {
      return c.json({ error: "forbidden", message: "That character belongs to another player." }, 403);
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
    if (!promptUri || !isRecordUri(promptUri)) {
      return c.json({ error: "validation_failed", message: "promptUri must be an atproto record URI" }, 400);
    }

    // The reply seals the prompt's CID, and Antiphony refuses a wrong one: take
    // it from the prompt as this campaign published it, never from the client.
    const prompt = (await svc.store.listPrompts(campaignId)).find((p) => p.antiphonyPromptUri === promptUri);
    if (!prompt?.antiphonyPromptCid) {
      return c.json({ error: "not_found", message: "No published prompt with that promptUri in this campaign." }, 404);
    }

    // Post to Antiphony via gateway
    const replyUri = await svc.antiphony.createReply({
      promptUri: promptUri,
      promptCid: prompt.antiphonyPromptCid,
      space: campaignSpace(campaignId),
      audioBlob,
      actingDid: player.did as `did:${string}`,
      // A player's reply is their own record at the table.
      spaceAuthor: "actor",
      ...(text ? { text } : {}),
    });

    // Ingest into character signal
    await ingestReplies(svc, {
      campaignId,
      characterId,
      antiphonyPromptUri: promptUri,
      intent,
    });

    return c.json({ success: true, replyUri }, 201);
  });

  // --- Step 3: Readiness gate query ------------------------------------------
  app.get("/api/campaigns/:campaignId/readiness", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterIds = c.req.queries("character") ?? [];
    const minTraits = c.req.query("minTraits");
    const minExemplars = c.req.query("minExemplars");
    const requireVoice = c.req.query("requireVoice");
    let thresholds: z.infer<typeof ReadinessThresholds> | undefined;
    if (minTraits !== undefined || minExemplars !== undefined || requireVoice !== undefined) {
      const parsed = ReadinessThresholds.safeParse({
        ...(minTraits !== undefined ? { minConfidentTraits: Number(minTraits) } : {}),
        ...(minExemplars !== undefined ? { minBehaviorExemplars: Number(minExemplars) } : {}),
        ...(requireVoice !== undefined ? { requireVoice: requireVoice !== "false" } : {}),
      });
      if (!parsed.success) {
        return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
      }
      thresholds = parsed.data;
    }
    const readiness = await checkReadiness(svc, {
      campaignId,
      characterIds,
      ...(thresholds ? { thresholds } : {}),
    });
    return c.json(readiness);
  });

  // --- Step 4: Generate a chapter & stream its rendered audio ----------------
  app.post("/api/campaigns/:campaignId/chapters", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to generate a chapter." }, 401);
    }

    const campaignId = c.req.param("campaignId");
    const campaign = await svc.store.getCampaign(campaignId);
    if (!campaign) {
      return c.json({ error: "not_found", message: `Campaign ${campaignId} not found` }, 404);
    }
    if (campaign.dm !== player.did) {
      return c.json({ error: "forbidden", message: "Only the campaign DM can generate chapters." }, 403);
    }

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
        ...(parsed.data.thresholds ? { thresholds: parsed.data.thresholds } : {}),
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof NotReadyError) {
        return c.json({ error: "not_ready", blocking: err.blocking }, 409);
      }
      throw err;
    }
  });

  app.get("/api/campaigns/:campaignId/chapters/:chapterId/audio", async (c) => {
    const player = await resolvePlayer(c, svc);
    if (!player) {
      return c.json({ error: "unauthorized", message: "Sign-in required to listen to chapters." }, 401);
    }
    const campaignId = c.req.param("campaignId");
    const chapterId = c.req.param("chapterId");
    const campaign = await svc.store.getCampaign(campaignId);
    if (!campaign) {
      return c.json({ error: "not_found", message: `Campaign ${campaignId} not found` }, 404);
    }
    const isParty = campaign.dm === player.did || campaign.party.includes(`at://${player.did}` as never);
    if (!isParty) {
      return c.json({ error: "forbidden", message: "Only the DM and party may listen to this chapter." }, 403);
    }
    if (!svc.audioStorage) {
      return c.json({ error: "not_found", message: "Chapter audio storage is not configured." }, 404);
    }
    const audio = await svc.audioStorage.get(chapterAudioKey(campaignId, chapterId));
    if (!audio) {
      return c.json({ error: "not_found", message: "Chapter audio not found." }, 404);
    }
    const body = audio.body instanceof Uint8Array ? audio.body.slice().buffer : audio.body;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": audio.contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  });

  // --- Character creation: session zero (docs/character-creation.md) ---------
  // Every route acts as the signed-in player, on their own creations only.

  const asPlayer =
    (handler: (c: Context, did: `did:${string}`) => Promise<Response>) =>
    async (c: Context): Promise<Response> => {
      const player = await resolvePlayer(c, svc);
      if (!player) return c.json({ error: "unauthorized", message: "Sign-in required." }, 401);
      try {
        return await handler(c, player.did as `did:${string}`);
      } catch (err) {
        if (err instanceof CreationError) {
          return c.json({ error: err.code, message: err.message }, CREATION_ERROR_STATUS[err.code]);
        }
        throw err;
      }
    };

  const parseBody = async <T>(c: Context, schema: z.ZodType<T>) => schema.safeParse(await c.req.json().catch(() => null));

  app.get("/api/creations", asPlayer(async (c, did) => c.json({ creations: await listCreations(svc, { did }) })));

  app.post("/api/creations", asPlayer(async (c, did) => c.json(await startCreation(svc, { did }), 201)));

  app.get("/api/creations/:id", asPlayer(async (c, did) => c.json(await getCreation(svc, { id: c.req.param("id")!, did }))));

  // The answer to the current prompt: multipart `audio` (and optional `text`), or JSON { text } as the typed fallback.
  app.post(
    "/api/creations/:id/answer",
    asPlayer(async (c, did) => {
      let audio: Blob | undefined;
      let text: string | undefined;
      if ((c.req.header("content-type") || "").includes("multipart/form-data")) {
        const form = await c.req.formData();
        const file = form.get("audio");
        if (file instanceof Blob) audio = file;
        text = (form.get("text") as string | null) || undefined;
      } else {
        const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null;
        if (typeof body?.text === "string") text = body.text;
      }
      return c.json(await answerCreation(svc, { id: c.req.param("id")!, did, ...(audio ? { audio } : {}), ...(text ? { text } : {}) }));
    }),
  );

  // A fresh link to hear the narrator ask question `turn`. Signed and short-lived: play it, don't keep it.
  app.get(
    "/api/creations/:id/turns/:turn/audio",
    asPlayer(async (c, did) => {
      const turn = Number(c.req.param("turn"));
      if (!Number.isInteger(turn) || turn < 0) return c.json({ error: "validation_failed", message: "turn must be an index" }, 400);
      const url = await questionAudio(svc, { id: c.req.param("id")!, did, turn });
      return url ? c.json({ url }) : c.json({ error: "not_found", message: "that question has no audio" }, 404);
    }),
  );

  // Move on without the player: picks up a transcript Antiphony finished, or retries a failed step.
  app.post("/api/creations/:id/advance", asPlayer(async (c, did) => c.json(await advanceCreation(svc, { id: c.req.param("id")!, did }))));

  app.post(
    "/api/creations/:id/pick",
    asPlayer(async (c, did) => {
      const parsed = await parseBody(c, PickAttributeSchema);
      if (!parsed.success) return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
      return c.json(await pickAttribute(svc, { id: c.req.param("id")!, did, ...parsed.data }));
    }),
  );

  app.post(
    "/api/creations/:id/name",
    asPlayer(async (c, did) => {
      const parsed = await parseBody(c, ConfirmNameSchema);
      if (!parsed.success) return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
      return c.json(await confirmName(svc, { id: c.req.param("id")!, did, name: parsed.data.name }));
    }),
  );

  app.post("/api/creations/:id/propose", asPlayer(async (c, did) => c.json(await proposeCharacter(svc, { id: c.req.param("id")!, did }))));

  app.post(
    "/api/creations/:id/revise",
    asPlayer(async (c, did) => {
      const parsed = await parseBody(c, ReviseLineSchema);
      if (!parsed.success) return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
      return c.json(await reviseLine(svc, { id: c.req.param("id")!, did, line: parsed.data.line }));
    }),
  );

  app.post(
    "/api/creations/:id/confirm",
    asPlayer(async (c, did) => {
      const parsed = await parseBody(c, ConfirmCharacterSchema);
      if (!parsed.success) return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
      return c.json(await confirmCharacter(svc, { id: c.req.param("id")!, did, ...parsed.data }), 201);
    }),
  );

  // --- Step 5: Suggest prompts -----------------------------------------------
  app.get("/api/campaigns/:campaignId/suggested-prompts", async (c) => {
    const campaignId = c.req.param("campaignId");
    const characterIds = c.req.queries("character") ?? [];
    const suggestions = await suggestPrompts(svc, { campaignId, characterIds });
    return c.json({ suggestions });
  });

  return app;
}
