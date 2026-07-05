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
        theme_color: "#241a12",
        background_color: "#241a12",
        display: "standalone",
        // TODO(bardcast): render PNG sizes from the SVG for broader install support.
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
    }),
  ],
  server: { port: 5173 },
});
