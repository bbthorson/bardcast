import { serve } from "@hono/node-server";
import { buildServices, pgSqlClient, neonSqlClient, runMigrations } from "./adapters/index.js";
import { createApp } from "./app.js";

const port = Number(process.env["PORT"] ?? 8787);

const antiphonyBaseUrl =
  process.env["ANTIPHONY_BASE_URL"] ??
  process.env["VOXPOP_BASE_URL"] ??
  "http://localhost:8080";

const antiphonyServiceToken =
  process.env["ANTIPHONY_SERVICE_TOKEN"] ??
  process.env["VOXPOP_SERVICE_TOKEN"];

const databaseUrl = process.env["DATABASE_URL"];

if (databaseUrl) {
  const sql = databaseUrl.includes("neon.tech")
    ? neonSqlClient(databaseUrl)
    : pgSqlClient(databaseUrl);
  // Ensure tables and indexes are ready on boot
  await runMigrations(sql);
}

const elevenLabsApiKey = process.env["ELEVENLABS_API_KEY"];
const defaultNarratorVoiceId = process.env["ELEVENLABS_NARRATOR_VOICE_ID"];

const svc = buildServices({
  antiphonyBaseUrl,
  appBaseUrl: process.env["APP_BASE_URL"] ?? "http://localhost:5173",
  orchestratorBaseUrl: process.env["ORCHESTRATOR_BASE_URL"] ?? `http://localhost:${port}`,
  auth: process.env["AUTH_MODE"] === "atproto" ? "atproto" : "stub",
  ...(process.env["APP_NAME"] !== undefined ? { appName: process.env["APP_NAME"] } : {}),
  ...(antiphonyServiceToken !== undefined ? { antiphonyServiceToken } : {}),
  ...(databaseUrl !== undefined ? { databaseUrl } : {}),
  ...(elevenLabsApiKey !== undefined ? { elevenLabsApiKey } : {}),
  ...(defaultNarratorVoiceId !== undefined ? { defaultNarratorVoiceId } : {}),
});

const app = createApp(svc);

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`bardcast-orchestrator listening on http://localhost:${info.port}`);
});
