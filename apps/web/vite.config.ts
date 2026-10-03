import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The public front door. A plain static Vite build (no PWA, no SSR) so it drops
// straight onto Cloudflare Workers static assets — see docs/hosting.md. This
// app only talks to the orchestrator over HTTP (VITE_ORCHESTRATOR_URL), so
// nothing here needs a server runtime.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
});
