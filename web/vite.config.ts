import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    proxy: {
      // avoid CORS against the local MOTIS server during dev
      "/api": "http://localhost:8080",
    },
  },
});