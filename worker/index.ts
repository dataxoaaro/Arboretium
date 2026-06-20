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
  LOCAL_ADMIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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

export default app;
