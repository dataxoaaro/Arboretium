// ARB-033: Origin header check for state-changing methods.
// JWT cookies are SameSite=Strict, but we add an Origin allowlist as
// defense-in-depth on POST/PATCH/PUT/DELETE.
//
// `allowedOrigin` is comma-separated to permit both the SPA (5173) and the
// local admin tool (3001) without further code changes.

import { createMiddleware } from "hono/factory";

const STATE_CHANGING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function originCheck(allowedOrigin: string) {
  const allowed = new Set(
    allowedOrigin
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return createMiddleware(async (c, next) => {
    if (STATE_CHANGING.has(c.req.method)) {
      const origin = c.req.header("Origin");
      // No Origin header means non-browser caller (curl, server-side); allow.
      // The JWT cookie can't be set without browser cooperation anyway, so
      // this only loosens curl-based testing.
      if (origin && !allowed.has(origin)) {
        // Same-origin requests are always allowed: in production the SPA and
        // API share one origin, so no ALLOWED_ORIGIN config is needed there.
        // The allowlist only covers extra origins (e.g. the Vite dev proxy).
        let sameOrigin = false;
        try {
          sameOrigin = new URL(c.req.url).origin === origin;
        } catch {
          sameOrigin = false;
        }
        if (!sameOrigin) {
          return c.json({ error: "Origin not allowed" }, 403);
        }
      }
    }
    await next();
  });
}
