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
import { ElevenLabsVoiceCloner } from "./elevenlabs/voice-cloner.js";
import { ElevenLabsAudioRenderer } from "./elevenlabs/audio-renderer.js";

export * from "./postgres/client.js";
export * from "./postgres/postgres-store.js";
export * from "./postgres/postgres-atproto-stores.js";
export * from "./postgres/migrate.js";
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

  const store = config.store ?? (sql ? new PostgresStore(sql) : new InMemoryStore());

  const identity: IdentityProvider =
    config.auth === "atproto"
      ? new AtprotoIdentityProvider({
          baseUrl: config.orchestratorBaseUrl,
          appName: config.appName ?? "Bardcast",
          postLoginRedirect: config.appBaseUrl,
          ...(serviceToken !== undefined ? { antiphonyServiceToken: serviceToken } : {}),
          ...(sql
            ? {
                appSessionStore: new PostgresAppSessionStore(sql),
                sessionStore: new PostgresSessionStore(sql),
                stateStore: new PostgresStateStore(sql),
              }
            : {}),
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
