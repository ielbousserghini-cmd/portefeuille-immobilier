import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // En dev (npm run dev:client), on fait suivre les appels /api vers le
    // serveur Express lancé séparément (npm run dev:server) sur le port 3000.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
