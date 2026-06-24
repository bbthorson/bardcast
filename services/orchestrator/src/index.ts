import { serve } from "@hono/node-server";
import { buildServices } from "./adapters/index.js";
import { createApp } from "./app.js";

const port = Number(process.env["PORT"] ?? 8787);

const svc = buildServices({
  voxPopBaseUrl: process.env["VOXPOP_BASE_URL"] ?? "http://localhost:8080",
  appBaseUrl: process.env["APP_BASE_URL"] ?? "http://localhost:5173",
  orchestratorBaseUrl: process.env["ORCHESTRATOR_BASE_URL"] ?? `http://localhost:${port}`,
  auth: process.env["AUTH_MODE"] === "atproto" ? "atproto" : "stub",
  ...(process.env["APP_NAME"] !== undefined ? { appName: process.env["APP_NAME"] } : {}),
  ...(process.env["VOXPOP_SERVICE_TOKEN"] !== undefined
    ? { voxPopServiceToken: process.env["VOXPOP_SERVICE_TOKEN"] }
    : {}),
});

const app = createApp(svc);

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`bardcast-orchestrator listening on http://localhost:${info.port}`);
});
