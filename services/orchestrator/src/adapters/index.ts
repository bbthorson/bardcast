import { PwaEngagementChannel } from "@bardcast/engagement";
import { AntiphonyClient } from "@bardcast/antiphony-client";
import type { CoreServices, Store, SqlClient } from "../ports/index.js";
import type { IdentityProvider } from "../ports/identity-provider.js";
import { AtprotoIdentityProvider } from "./atproto/identity-provider.js";
import { InMemoryStore } from "./in-memory-store.js";
import { StubAudioRenderer } from "./stub-audio-renderer.js";
import { StubIdentityProvider } from "./stub-identity-provider.js";
import { StubNarrativeWriter } from "./stub-narrative-writer.js";
import { StubVoiceCloner } from "./stub-voice-cloner.js";
import { StubDecisionModel } from "./stub-decision-model.js";
import { WorkersAiDecisionModel } from "./workers-ai-decision-model.js";
import { ClientAntiphonyGateway } from "./antiphony-gateway.js";
import { PostgresStore } from "./postgres/postgres-store.js";
import { neonSqlClient, pgSqlClient } from "./postgres/client.js";
import { D1Store } from "./d1/d1-store.js";
import type { D1Database } from "./d1/d1.js";
import { d1Store, memoryStore } from "@bbthorson/atproto-cf-auth/server";
import { ElevenLabsVoiceCloner } from "./elevenlabs/voice-cloner.js";
import { ElevenLabsAudioRenderer, type AudioStorageAdapter } from "./elevenlabs/audio-renderer.js";
import { ClaudeNarrativeWriter } from "./anthropic/narrative-writer.js";
import { AtprotoServiceAuthVerifier } from "./atproto/service-auth.js";
import { AtprotoRpgActorReader } from "./atproto/rpg-actor-reader.js";
import { AtprotoRpgActorWriter } from "./atproto/rpg-actor-writer.js";
import { R2AudioStorage, type R2Bucket } from "./r2-audio-storage.js";
import type { AudioStorage } from "../ports/audio-storage.js";
import type { RpgActorReader } from "../ports/rpg-actor-reader.js";
import type { RpgActorWriter } from "../ports/rpg-actor-writer.js";

export * from "./postgres/client.js";
export * from "./postgres/postgres-store.js";
export * from "./postgres/migrate.js";
export * from "./d1/d1.js";
export * from "./d1/d1-store.js";
export * from "./r2-audio-storage.js";
export * from "./elevenlabs/voice-cloner.js";
export * from "./elevenlabs/audio-renderer.js";
export * from "./workers-ai-decision-model.js";
export * from "./stub-decision-model.js";
export * from "./ai-gateway.js";
export * from "./anthropic/narrative-writer.js";
export * from "./atproto/rpg-actor-reader.js";
export * from "./atproto/rpg-actor-writer.js";

export interface BuildServicesConfig {
  /** Base URL of the (Bardcast-controlled) Antiphony deployment. */
  antiphonyBaseUrl?: string;
  /** @deprecated use antiphonyBaseUrl */
  voxPopBaseUrl?: string;
  /** Player PWA base URL — engagement deep links + post-login redirect. */
  appBaseUrl: string;
  /** This service's own public URL. (Sign-in derives its OAuth URLs from each request's origin.) */
  orchestratorBaseUrl: string;
  /** "atproto" = real AT-Proto OAuth identity; "stub" = dev header-based. */
  auth: "stub" | "atproto";
  appName?: string;
  /** ES256 private JWK (JSON) that makes sign-in a confidential OAuth client. The `OAUTH_PRIVATE_KEY` secret. */
  oauthPrivateKey?: string;
  /** Bearer Bardcast presents to its own Antiphony deployment. */
  antiphonyServiceToken?: string;
  /** @deprecated use antiphonyServiceToken */
  voxPopServiceToken?: string;
  /** Anthropic API key for the NarrativeWriter (Claude). Without it, the writer is a stub. */
  anthropicApiKey?: string;
  /** Claude model for the NarrativeWriter; defaults to Claude Opus 5.5. */
  narrativeModel?: string;
  /** ElevenLabs API key for voice cloning and multi-voice audio synthesis. */
  elevenLabsApiKey?: string;
  /** Default ElevenLabs voice ID for DM narration. */
  defaultNarratorVoiceId?: string;
  /** Cloudflare account + Workers AI token for the DecisionModel (Clef). Both or neither. */
  cloudflareAccountId?: string;
  cloudflareAiToken?: string;
  /** Workers AI model id for decisions; defaults to Clef-flash. */
  decisionModel?: string;
  /**
   * A Cloudflare AI Gateway (in `cloudflareAccountId`) to send text-to-speech,
   * decisions (Clef) and the NarrativeWriter (Claude) through. Voice cloning still goes straight to
   * ElevenLabs: it uploads the players' raw recordings, which shouldn't sit in
   * gateway logs.
   */
  aiGatewayId?: string;
  /** Only for an authenticated gateway. */
  aiGatewayToken?: string;
  /** PostgreSQL connection string. If provided, activates PostgresStore and persistent OAuth stores. */
  databaseUrl?: string;
  /**
   * Cloudflare D1 binding. When set (the Worker), D1 holds the Store and the
   * AT-Proto stores, and takes precedence over `databaseUrl`.
   */
  d1?: D1Database;
  /** Seals sign-in sessions at rest. Required with `d1` + atproto auth. */
  sessionSecret?: string;
  /** Optional pre-configured SqlClient (e.g. for testing). */
  sqlClient?: SqlClient;
  /** Optional custom store override. */
  store?: Store;
  /** Cloudflare R2 bucket binding for rendered chapter MP3s (`AUDIO_BUCKET`). */
  r2AudioBucket?: R2Bucket;
  /** Optional custom audio storage override (e.g. InMemoryAudioStorage in tests). */
  audioStorage?: AudioStorage & AudioStorageAdapter;
  /**
   * Bardcast's own DID (`BARDCAST_DID`): the authority of the spaces it makes,
   * and whose DID document publishes its managing-app service
   * (`#bardcast_spaces`). With it, Bardcast answers
   * `com.atproto.managedspace.checkAccess`; without it, that method answers
   * `MethodNotImplemented`.
   */
  /** Optional custom rpg.actor reader (defaults to AtprotoRpgActorReader when auth is "atproto"). */
  rpgActor?: RpgActorReader;
  /** Optional custom rpg.actor writer (defaults to AtprotoRpgActorWriter when auth is "atproto"). */
  rpgActorWriter?: RpgActorWriter;
  appDid?: `did:${string}`;
}

/**
 * The composition root. Wires every port to an adapter and returns the bundle
 * the use-cases run against.
 */
export function buildServices(config: BuildServicesConfig): CoreServices {
  const serviceToken = config.antiphonyServiceToken ?? config.voxPopServiceToken;
  const baseUrl = config.antiphonyBaseUrl ?? config.voxPopBaseUrl ?? "http://localhost:8080";

  let sql: SqlClient | undefined = config.sqlClient;
  if (!sql && config.databaseUrl) {
    sql = config.databaseUrl.includes("neon.tech")
      ? neonSqlClient(config.databaseUrl)
      : pgSqlClient(config.databaseUrl);
  }

  const store =
    config.store ?? (config.d1 ? new D1Store(config.d1) : sql ? new PostgresStore(sql) : new InMemoryStore());

  let identity: IdentityProvider = new StubIdentityProvider();
  if (config.auth === "atproto") {
    if (config.d1 && !config.sessionSecret) {
      throw new Error("SESSION_SECRET is required to store AT-Proto sessions in D1");
    }
    identity = new AtprotoIdentityProvider({
      appName: config.appName ?? "Bardcast",
      // D1 on Workers. The Node dev server is one process, so memory is enough
      // there, and a per-process secret only costs a re-login on restart.
      store: config.d1 ? d1Store(config.d1) : memoryStore(),
      secret: config.sessionSecret ?? randomSecret(),
      origin: config.orchestratorBaseUrl,
      ...(config.oauthPrivateKey !== undefined ? { privateKeys: [config.oauthPrivateKey] } : {}),
      ...(serviceToken !== undefined ? { antiphonyServiceToken: serviceToken } : {}),
    });
  }

  // Antiphony is headless: the only credential is Bardcast's app service token
  const antiphony = new AntiphonyClient({
    baseUrl,
    getServiceToken: () => serviceToken ?? "",
  });

  const engagement = new PwaEngagementChannel({
    apiBaseUrl: config.appBaseUrl,
    sendPush: async () => {
      // TODO(bardcast): real Web Push (VAPID).
    },
    promptUrl: (promptRef) => `${config.appBaseUrl}/play/${encodeURIComponent(promptRef)}`,
  });

  const voice = config.elevenLabsApiKey
    ? new ElevenLabsVoiceCloner({ apiKey: config.elevenLabsApiKey })
    : new StubVoiceCloner();

  if (config.aiGatewayId && !config.cloudflareAccountId) {
    throw new Error("AI_GATEWAY_ID needs CLOUDFLARE_ACCOUNT_ID: a gateway lives in an account");
  }
  const gateway =
    config.aiGatewayId && config.cloudflareAccountId
      ? {
          accountId: config.cloudflareAccountId,
          gatewayId: config.aiGatewayId,
          ...(config.aiGatewayToken ? { token: config.aiGatewayToken } : {}),
        }
      : undefined;

  const audioStorage = config.audioStorage ?? (config.r2AudioBucket ? new R2AudioStorage(config.r2AudioBucket) : undefined);

  const audio = config.elevenLabsApiKey
    ? new ElevenLabsAudioRenderer({
        apiKey: config.elevenLabsApiKey,
        ...(config.defaultNarratorVoiceId ? { defaultNarratorVoiceId: config.defaultNarratorVoiceId } : {}),
        ...(gateway ? { gateway } : {}),
        ...(audioStorage ? { storage: audioStorage } : {}),
      })
    : new StubAudioRenderer();

  const decisions =
    config.cloudflareAccountId && config.cloudflareAiToken
      ? new WorkersAiDecisionModel({
          accountId: config.cloudflareAccountId,
          apiToken: config.cloudflareAiToken,
          ...(config.decisionModel ? { model: config.decisionModel } : {}),
          ...(gateway ? { gateway } : {}),
        })
      : new StubDecisionModel();

  const rpgActor = config.rpgActor ?? (config.auth === "atproto" ? new AtprotoRpgActorReader() : undefined);
  const rpgActorWriter =
    config.rpgActorWriter ??
    (identity instanceof AtprotoIdentityProvider
      ? new AtprotoRpgActorWriter({ restoreSession: (did) => identity.auth.restore(did) })
      : undefined);

  return {
    store,
    antiphony: new ClientAntiphonyGateway(antiphony),
    narrative: config.anthropicApiKey
      ? new ClaudeNarrativeWriter({
          apiKey: config.anthropicApiKey,
          ...(config.narrativeModel ? { model: config.narrativeModel } : {}),
          ...(gateway ? { gateway } : {}),
        })
      : new StubNarrativeWriter(),
    voice,
    audio,
    ...(audioStorage ? { audioStorage } : {}),
    identity,
    decisions,
    engagement,
    ...(rpgActor ? { rpgActor } : {}),
    ...(rpgActorWriter ? { rpgActorWriter } : {}),
    clock: () => new Date(),
    ...(config.appDid ? { managingApp: { appDid: config.appDid, serviceAuth: new AtprotoServiceAuthVerifier() } } : {}),
  };
}

function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}
