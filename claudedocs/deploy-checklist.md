# Deploy checklist (ARB-E10)

**Status: deployed and live** at `https://arboretium.tikutakuminni.workers.dev`.
One Worker named **`arboretium`** serves both the SPA (static assets from
`./dist`) and the API under `/api/*` on a single origin (see ADR-0003).

Deploy is **automatic on push to `main`** via a Cloudflare **Workers Builds**
Git integration (shows up as the `Workers Builds: arboretium` check on each
commit). It builds the SPA and deploys the Worker — no manual step needed.
GitHub Actions (`.github/workflows/ci.yml`) is separate and only
lints/typechecks/tests/builds; it does not deploy.

> **Workers Builds deploys CODE ONLY — it does NOT run D1 migrations.** For any
> schema change, run `pnpm db:migrate:remote` *before* pushing (or the new code
> will hit columns that don't exist in prod). Migrations are forward-compatible
> here (additive columns with defaults), so applying them ahead of the deploy is
> safe.

Manual deploy still works as a fallback / hotfix:

```bash
pnpm build && pnpm run deploy    # `pnpm run deploy` == `wrangler deploy` (uploads ./dist)
```

> Use `pnpm run deploy`, not `pnpm deploy` — the latter is a reserved pnpm
> built-in and errors with `ERR_PNPM_CANNOT_DEPLOY`.
>
> `wrangler deploy` does **not** build — it only uploads whatever is already in
> `./dist`. Always `pnpm build` first, or you'll ship a stale bundle.

Prefer one path at a time: pushing already deploys, so a manual `wrangler deploy`
on top is redundant. Either way, `wrangler deploy` overrides dashboard-only vars.

## 1. Resources (already created — one time)

```bash
npx wrangler d1 create arboritium             # name kept; a rename isn't worth it
npx wrangler kv namespace create RATE_LIMIT
npx wrangler r2 bucket create arboritium-photos
```

The IDs already live in `wrangler.toml` (`d1_databases.database_id`,
`kv_namespaces.id`, the R2 bucket name). D1/KV IDs and the bucket name are
identifiers, not secrets — safe to commit. The Worker name in `wrangler.toml`
must stay **`arboretium`**; a past typo (`arboritium`) created a stray empty
worker that silently swallowed `wrangler secret` / `wrangler deploy`.

## 2. Secrets (already set — never committed)

Set as **secrets**, not dashboard plain-text vars (a deploy wipes dashboard vars
not present in `wrangler.toml [vars]`; secrets persist):

```bash
npx wrangler secret put SITE_PASSWORD      # the family registration passphrase
npx wrangler secret put JWT_SECRET         # paste: openssl rand -base64 32
npx wrangler secret put MML_API_KEY        # Maanmittauslaitos map-tile key
```

All three are currently set on the live `arboretium` worker. `SITE_PASSWORD` is
compared constant-time with an exact-length check — set it with the interactive
prompt or `printf '%s'`, never `echo "x" |` (a trailing newline breaks it).

## 3. Migrations (already applied)

```bash
npx wrangler d1 migrations apply DB --remote   # or: pnpm db:migrate:remote
```

All migrations through `0009_drop_property_members` are applied to the remote D1.

## 4. Access model — no separate admin tool, no LOCAL_ADMIN

There is **no `LOCAL_ADMIN` gate anymore** (removed in `4b245f7`) and **no
per-property owner/membership** (removed in `340c487`). Access is now
platform-wide:

- Registration is gated by `SITE_PASSWORD`.
- Every **registered** user is trusted: any logged-in user can use the
  `/api/admin/*` endpoints (create/edit/archive properties, list/delete users,
  mint password-reset links). These return `401` when unauthenticated — **not**
  `404`.
- The single trust boundary is therefore `SITE_PASSWORD`. There is no separate
  members step; once a property exists, every registered user can see it.

To manage **production** data you just log into the live site and use the admin
pages in the SPA (`/admin/*`) — no local-against-remote dance required.

## 5. Smoke test (do after each significant deploy)

1. **Register** on the live site with the site password → empty property picker.
2. Go to `/admin/properties`, **create a property** (draw boundary / pick hexes).
3. Reload → the property appears; open it, drop a plant, add a photo, jot a cell
   note.
4. **PWA:** phone browser → "Add to Home Screen". Airplane mode → reopen →
   previously-loaded plants/photos still render (offline read).
5. After deploying a new build, force the installed PWA to update (close &
   reopen, or hard-reload) so the service worker swaps to the new shell — an old
   cached shell can call endpoints the new worker no longer exposes.

## Cost

€0/month on the free tier — see `claudedocs/infra-cost-review.md` and
`claudedocs/cost-guardrails.md`. R2 has a card on file; the Worker hard-caps
photo storage at `MAX_PHOTO_BYTES` (HTTP 507 past ~9 GB). Add a Cloudflare
billing/usage notification as a backstop.
