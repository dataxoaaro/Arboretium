import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { mapRoutes } from "./routes/map";
import { adminRoutes } from "./routes/admin";
import { propertyRoutes } from "./routes/properties";
import { plantRoutes } from "./routes/plants";
import { cellRoutes } from "./routes/cells";
import { photoRoutes } from "./routes/photos";
import { originCheck } from "./lib/origin-check";

type Bindings = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RATE_LIMIT: KVNamespace;
  SITE_PASSWORD: string;
  JWT_SECRET: string;
  MML_API_KEY: string;
  ALLOWED_ORIGIN: string;
  /** Static-assets binding — present only in the deployed Worker (see wrangler.toml). */
  ASSETS?: Fetcher;
};

// The Hono API. Exported for the worker tests, which call `app.request(...)`
// directly. In production the default export below wraps it (assets + /api).
export const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c, next) => {
  return originCheck(c.env.ALLOWED_ORIGIN)(c, next);
});

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "arboretum-worker",
    time: new Date().toISOString(),
  }),
);

// The Worker is an API only; the SPA lives on :5173 in dev (or behind a Pages
// route in prod). These two handlers exist so a stray browser tab pointed at
// the Worker URL doesn't spam the dev log with 404s.
app.get("/", (c) =>
  c.text(
    "Arboretum Worker — API only. Open the SPA at http://127.0.0.1:5173",
    200,
  ),
);
app.get("/favicon.ico", (c) => c.body(null, 204));

app.route("/auth", authRoutes);
app.route("/map", mapRoutes);
app.route("/admin", adminRoutes);
app.route("/properties", propertyRoutes);
app.route("/plants", plantRoutes);
app.route("/cells", cellRoutes);
app.route("/photos", photoRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("Worker error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Production entry: one Worker serves both the SPA and the API on a single
// origin. `/api/*` is stripped and handed to the Hono app (mirroring the Vite
// dev proxy); everything else is served from static assets, with SPA fallback
// to index.html (wrangler.toml `not_found_handling`). In local `wrangler dev`
// there's no ASSETS binding, so non-API requests fall back to the app.
export default {
  async fetch(
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const innerPath = url.pathname.replace(/^\/api/, "") || "/";
      const inner = new Request(
        new URL(innerPath + url.search, url.origin),
        request,
      );
      return app.fetch(inner, env, ctx);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return app.fetch(request, env, ctx);
  },
};
