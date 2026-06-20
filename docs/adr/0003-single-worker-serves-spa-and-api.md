# One Worker serves the SPA and the API (not Pages + a separate Worker)

The production deployment is a **single Cloudflare Worker** that serves both the
built SPA (via static assets) and the JSON API. `/api/*` is stripped and handed
to the Hono app; every other path is served from `./dist` with SPA fallback to
`index.html`. This supersedes the PRD §8.8 plan of Cloudflare Pages + a separate
Worker.

## Why

- **Single origin.** The SPA and API share one origin, so the
  `SameSite=Strict` session cookie and the Origin check work with no CORS setup.
  The origin check also allows same-origin requests, so no `ALLOWED_ORIGIN` is
  needed in production.
- **One deploy.** Cloudflare Workers Builds runs `pnpm build && wrangler deploy`
  on push — no separate Pages project, no cross-service wiring.
- **Dev/prod parity.** The Worker entry strips `/api` exactly like the Vite dev
  proxy, so requests route identically in both. In `wrangler dev` there's no
  `ASSETS` binding, so the entry falls back to the Hono app (API-only), keeping
  local dev unchanged.

## Consequences

- `worker/index.ts` exports the Hono app as a **named** export (`app`, used by
  the worker tests via `app.request`) and a default `fetch` wrapper for prod.
- `wrangler.toml` uses `[assets]` with `run_worker_first = true` so `/api/*`
  reliably reaches the Worker (requires wrangler v4 — upgraded).
- Admin stays local-only: `LOCAL_ADMIN` is never set on the deployed Worker, so
  manage production data by running `wrangler dev --remote` locally (see
  `claudedocs/deploy-checklist.md`).
