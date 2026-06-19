import {
  defineWorkersProject,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

// Worker integration tests run inside workerd (Miniflare) with real local
// D1/R2/KV bindings — see docs/adr/0001-testing-strategy.md. Migrations are
// read at config time and applied per-test via the setup file.
export default defineWorkersProject(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "migrations"),
  );

  return {
    test: {
      name: "worker",
      include: ["test/worker/**/*.test.ts"],
      setupFiles: ["./test/worker/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          // isolatedStorage snapshots SQLite files; R2's WAL -shm companion
          // trips an assertion in this pool version. We isolate explicitly via
          // a beforeEach reset in the setup file instead.
          isolatedStorage: false,
          miniflare: {
            compatibilityDate: "2025-01-15",
            compatibilityFlags: ["nodejs_compat"],
            d1Databases: ["DB"],
            r2Buckets: ["PHOTOS"],
            kvNamespaces: ["RATE_LIMIT"],
            bindings: {
              SITE_PASSWORD: "correct-horse-battery-staple",
              JWT_SECRET: "test-jwt-secret-key-at-least-32-bytes-long",
              MML_API_KEY: "",
              ALLOWED_ORIGIN: "http://localhost:5173",
              LOCAL_ADMIN: "true",
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
