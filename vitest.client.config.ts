import { defineProject } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Frontend unit/component tests run in jsdom. The MapLibre/WebGL and canvas
// layers are deliberately excluded from unit tests (see
// docs/adr/0001-testing-strategy.md) and covered by Playwright E2E in E11.
export default defineProject({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    name: "client",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/client/setup.ts"],
    include: ["test/client/**/*.test.{ts,tsx}"],
  },
});
