import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

// Apply the numbered D1 migrations once into the shared test database. The
// migration list is injected as a binding by vitest.workers.config.ts.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Explicit per-test isolation (isolatedStorage is disabled — see the config).
// Wipe all rows (children first for FK safety) and clear KV + R2 before each
// test so spatial-first lookups, rate-limit counters, and stored objects never
// bleed between tests.
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM photos"),
    env.DB.prepare("DELETE FROM plants"),
    env.DB.prepare("DELETE FROM cells"),
    env.DB.prepare("DELETE FROM property_members"),
    env.DB.prepare("DELETE FROM password_reset_tokens"),
    env.DB.prepare("DELETE FROM properties"),
    env.DB.prepare("DELETE FROM users"),
  ]);

  const kvKeys = await env.RATE_LIMIT.list();
  await Promise.all(kvKeys.keys.map((k) => env.RATE_LIMIT.delete(k.name)));

  const objects = await env.PHOTOS.list();
  await Promise.all(objects.objects.map((o) => env.PHOTOS.delete(o.key)));
});
