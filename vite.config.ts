import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.BASE_URL || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      workbox: {
        navigateFallbackDenylist: [/\/branches\//, /\/ci-logs/],
      },
      manifest: {
        name: "MangaTrans",
        short_name: "MangaTrans",
        description: "Learn Japanese by translating manga",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["fake-indexeddb/auto", "@testing-library/jest-dom/vitest"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
