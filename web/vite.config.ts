import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // avoid CORS against the local MOTIS server during dev
      "/api": "http://localhost:8080",
    },
  },
});
