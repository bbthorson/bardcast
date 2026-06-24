import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Mobile-first PWA so players install nothing and can be re-engaged via push.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Bardcast",
        short_name: "Bardcast",
        description: "Answer your DM's prompts in your own voice.",
        theme_color: "#1b1033",
        background_color: "#1b1033",
        display: "standalone",
        // TODO(bardcast): add real icon assets under public/.
        icons: [],
      },
    }),
  ],
  server: { port: 5173 },
});
