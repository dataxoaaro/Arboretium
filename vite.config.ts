import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { execSync } from "node:child_process";

// Build-time version stamp shown in the app header so we can tell which build is
// live (and whether a phone is on a stale PWA shell). Uses the git short SHA,
// suffixed with "*" if the working tree was dirty at build time. Falls back to
// "dev" outside a git checkout.
function appVersion(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim();
    const dirty = execSync("git status --porcelain", {
      encoding: "utf8",
    }).trim();
    return dirty ? `${sha}*` : sha;
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    // ARB-160..163: installable PWA + offline app shell. The service worker is
    // generated at build time and only registers in the production build
    // (devOptions.enabled: false), so it never interferes with `vite` dev.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Arboretium",
        short_name: "Arboretium",
        description: "Kartoita pihasi ja mökkisi kasvit ja puut.",
        theme_color: "#3f7d44",
        background_color: "#f6f5ee",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // ARB-162: map tiles — long-lived, cache-first (cross-origin/opaque).
            urlPattern: ({ url }) =>
              /maanmittauslaitos|tile\.openstreetmap|arcgisonline/.test(
                url.href,
              ),
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // ARB-163: API GETs (incl. photo bytes) — fresh when online, cached
            // when offline.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      // Forward /api/* unchanged; the Worker entry strips the /api prefix, so
      // dev and production route identically.
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
