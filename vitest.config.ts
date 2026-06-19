import { defineConfig } from "vitest/config";

// Root config aggregates the two projects and owns coverage. Coverage excludes
// the map/WebGL/canvas rendering layer by design (docs/adr/0001-testing-strategy.md);
// that surface is covered by Playwright E2E in E11, not jsdom unit tests.
export default defineConfig({
  test: {
    projects: ["./vitest.workers.config.ts", "./vitest.client.config.ts"],
    coverage: {
      // istanbul (transform-time instrumentation) rather than v8: the v8
      // provider needs node:inspector, which workerd does not expose, so it
      // reports 0% statements/lines for the worker pool.
      provider: "istanbul",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "worker/**/*.ts",
        "src/lib/**/*.ts",
        "src/components/**/*.tsx",
        "src/routes/**/*.tsx",
        "src/admin/**/*.{ts,tsx}",
      ],
      exclude: [
        // Deliberate no-unit-test zone: MapLibre/WebGL + canvas resize (ADR-0001).
        // visibility-mode.ts is pure logic and stays covered.
        "src/components/map/MapView.tsx",
        "src/components/map/BasemapToggle.tsx",
        "src/admin/AdminMap.tsx",
        "src/lib/photos.ts",
        // Entry points / types / generated.
        "src/main.tsx",
        "src/vite-env.d.ts",
        "**/*.d.ts",
      ],
    },
  },
});
