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
import {
  PostgresAppSessionStore,
  PostgresSessionStore,
  PostgresStateStore,
} from "./postgres/postgres-atproto-stores.js";
import { neonSqlClient, pgSqlClient } from "./postgres/client.js";
import { D1Store } from "./d1/d1-store.js";
import { D1AppSessionStore, D1SessionStore, D1StateStore } from "./d1/d1-atproto-stores.js";
import type { D1Database } from "./d1/d1.js";
import { SealedJson } from "./atproto/sealed-json.js";
import type { AtprotoConfig } from "./atproto/identity-provider.js";
import { ElevenLabsVoiceCloner } from "./elevenlabs/voice-cloner.js";
import { ElevenLabsAudioRenderer } from "./elevenlabs/audio-renderer.js";

export * from "./postgres/client.js";
export * from "./postgres/postgres-store.js";
export * from "./postgres/postgres-atproto-stores.js";
export * from "./postgres/migrate.js";
export * from "./d1/d1.js";
export * from "./d1/d1-store.js";
export * from "./d1/d1-atproto-stores.js";
export * from "./elevenlabs/voice-cloner.js";
export * from "./elevenlabs/audio-renderer.js";
export * from "./workers-ai-decision-model.js";
export * from "./stub-decision-model.js";

export interface BuildServicesConfig {
  /** Base URL of the (Bardcast-controlled) Antiphony deployment. */
  antiphonyBaseUrl?: string;
  /** @deprecated use antiphonyBaseUrl */
  voxPopBaseUrl?: string;
  /** Player PWA base URL — engagement deep links + post-login redirect. */
  appBaseUrl: string;
  /** This service's own public URL — roots the AT-Proto client_id/redirect_uri. */
  orchestratorBaseUrl: string;
  /** "atproto" = real AT-Proto OAuth identity; "stub" = dev header-based. */
  auth: "stub" | "atproto";
  appName?: string;
  /** Bearer Bardcast presents to its own Antiphony deployment. */
  antiphonyServiceToken?: string;
  /** @deprecated use antiphonyServiceToken */
  voxPopServiceToken?: string;
  /** ElevenLabs API key for voice cloning and multi-voice audio synthesis. */
  elevenLabsApiKey?: string;
  /** Default ElevenLabs voice ID for DM narration. */
  defaultNarratorVoiceId?: string;
  /** Cloudflare account + Workers AI token for the DecisionModel (Clef). Both or neither. */
  cloudflareAccountId?: string;
  cloudflareAiToken?: string;
  /** Workers AI model id for decisions; defaults to Clef-flash. */
  decisionModel?: string;
  /** PostgreSQL connection string. If provided, activates PostgresStore and persistent OAuth stores. */
  databaseUrl?: string;
  /**
   * Cloudflare D1 binding. When set (the Worker), D1 holds the Store and the
   * AT-Proto stores, and takes precedence over `databaseUrl`.
   */
  d1?: D1Database;
  /** Seals OAuth sessions and state at rest. Required with `d1` + atproto auth. */
  sessionSecret?: string;
  /** AT-Proto handle resolver; required on Workers (see AtprotoConfig). */
  handleResolver?: AtprotoConfig["handleResolver"];
  /** Optional pre-configured SqlClient (e.g. for testing). */
  sqlClient?: SqlClient;
  /** Optional custom store override. */
  store?: Store;
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

  let atprotoStores: Pick<AtprotoConfig, "appSessionStore" | "sessionStore" | "stateStore"> = {};
  if (config.auth === "atproto" && config.d1) {
    if (!config.sessionSecret) {
      throw new Error("SESSION_SECRET is required to store AT-Proto sessions in D1");
    }
    const sealer = new SealedJson(config.sessionSecret);
    atprotoStores = {
      appSessionStore: new D1AppSessionStore(config.d1),
      sessionStore: new D1SessionStore(config.d1, sealer),
      stateStore: new D1StateStore(config.d1, sealer),
    };
  } else if (sql) {
    atprotoStores = {
      appSessionStore: new PostgresAppSessionStore(sql),
      sessionStore: new PostgresSessionStore(sql),
      stateStore: new PostgresStateStore(sql),
    };
  }

  const identity: IdentityProvider =
    config.auth === "atproto"
      ? new AtprotoIdentityProvider({
          baseUrl: config.orchestratorBaseUrl,
          appName: config.appName ?? "Bardcast",
          postLoginRedirect: config.appBaseUrl,
          ...(serviceToken !== undefined ? { antiphonyServiceToken: serviceToken } : {}),
          ...atprotoStores,
          ...(config.handleResolver !== undefined ? { handleResolver: config.handleResolver } : {}),
        })
      : new StubIdentityProvider();

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

  const audio = config.elevenLabsApiKey
    ? new ElevenLabsAudioRenderer({
        apiKey: config.elevenLabsApiKey,
        ...(config.defaultNarratorVoiceId ? { defaultNarratorVoiceId: config.defaultNarratorVoiceId } : {}),
      })
    : new StubAudioRenderer();

  const decisions =
    config.cloudflareAccountId && config.cloudflareAiToken
      ? new WorkersAiDecisionModel({
          accountId: config.cloudflareAccountId,
          apiToken: config.cloudflareAiToken,
          ...(config.decisionModel ? { model: config.decisionModel } : {}),
        })
      : new StubDecisionModel();

  return {
    store,
    antiphony: new ClientAntiphonyGateway(antiphony),
    narrative: new StubNarrativeWriter(),
    voice,
    audio,
    identity,
    decisions,
    engagement,
    clock: () => new Date(),
  };
}
