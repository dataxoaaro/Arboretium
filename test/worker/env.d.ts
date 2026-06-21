import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

// Types for the bindings provided to worker tests via cloudflare:test.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    PHOTOS: R2Bucket;
    RATE_LIMIT: KVNamespace;
    SITE_PASSWORD: string;
    JWT_SECRET: string;
    MML_API_KEY: string;
    ALLOWED_ORIGIN: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
