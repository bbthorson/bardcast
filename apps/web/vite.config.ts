import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The public front door. A plain static Vite build (no PWA, no SSR) so it drops
// straight onto Cloudflare Pages — see docs/hosting.md. The orchestrator (the
// Node AT-Proto OAuth client) stays on Cloud Run; this app only talks to it
// over HTTP, so nothing here needs a server runtime.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
});
