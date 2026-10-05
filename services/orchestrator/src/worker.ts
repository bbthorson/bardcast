import type { Hono } from "hono";
import { buildServices, migrateD1, type D1Database } from "./adapters/index.js";
import { createApp } from "./app.js";

/**
 * Cloudflare Workers entry. The `bardcast` Worker serves the apps/web assets
 * and, for `/api/*`, `/atproto/*` and `/healthz` (`run_worker_first` in the
 * root `wrangler.jsonc`), this orchestrator. One origin means the session
 * cookie is first-party: no `SameSite=None`, no third-party cookie blocking.
 *
 * `src/index.ts` stays the Node entry for local development.
 */
export interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Seals sign-in sessions in D1. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET?: string;
  APP_NAME?: string;
  ANTIPHONY_BASE_URL?: string;
  ANTIPHONY_SERVICE_TOKEN?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_NARRATOR_VOICE_ID?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
  DECISION_MODEL?: string;
}

let migrated: Promise<void> | undefined;

/**
 * One app per origin, so links the orchestrator builds (engagement deep links)
 * point at the origin the request came in on. Sign-in handles origins itself.
 * All state is in D1.
 */
const apps = new Map<string, Hono>();

function appFor(origin: string, env: Env): Hono {
  let app = apps.get(origin);
  if (!app) {
    const svc = buildServices({
      d1: env.DB,
      auth: "atproto",
      appBaseUrl: `${origin}/`,
      orchestratorBaseUrl: origin,
      antiphonyBaseUrl: env.ANTIPHONY_BASE_URL ?? "https://api.antiphony.dev",
      ...(env.SESSION_SECRET !== undefined ? { sessionSecret: env.SESSION_SECRET } : {}),
      ...(env.APP_NAME !== undefined ? { appName: env.APP_NAME } : {}),
      ...(env.ANTIPHONY_SERVICE_TOKEN !== undefined ? { antiphonyServiceToken: env.ANTIPHONY_SERVICE_TOKEN } : {}),
      ...(env.ELEVENLABS_API_KEY !== undefined ? { elevenLabsApiKey: env.ELEVENLABS_API_KEY } : {}),
      ...(env.ELEVENLABS_NARRATOR_VOICE_ID !== undefined
        ? { defaultNarratorVoiceId: env.ELEVENLABS_NARRATOR_VOICE_ID }
        : {}),
      ...(env.CLOUDFLARE_ACCOUNT_ID !== undefined ? { cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID } : {}),
      ...(env.CLOUDFLARE_AI_TOKEN !== undefined ? { cloudflareAiToken: env.CLOUDFLARE_AI_TOKEN } : {}),
      ...(env.DECISION_MODEL !== undefined ? { decisionModel: env.DECISION_MODEL } : {}),
    });
    app = createApp(svc);
    apps.set(origin, app);
  }
  return app;
}

function isApiPath(pathname: string): boolean {
  return pathname === "/healthz" || pathname.startsWith("/api/") || pathname.startsWith("/atproto/");
}

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request);

    let app: Hono;
    try {
      app = appFor(url.origin, env);
      migrated ??= migrateD1(env.DB).catch((err: unknown) => {
        migrated = undefined; // retry on the next request rather than wedge the isolate
        throw err;
      });
      await migrated;
    } catch (err) {
      // Most often a missing SESSION_SECRET. Say so instead of a bare 500.
      return Response.json({ error: "server_not_configured", detail: String(err) }, { status: 503 });
    }
    // Hono's fetch takes (request, env, executionCtx).
    return app.fetch(request, env, ctx as never);
  },
};
