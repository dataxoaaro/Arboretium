# Deploy checklist (ARB-E10)

The repo is connected to **Cloudflare Workers Builds** (Git integration), which
on every push to `main` runs `pnpm build` then `npx wrangler deploy`. One Worker
named **`arboritium`** serves both the SPA (static assets) and the API on a
single origin.

Run the one-time setup below, then every `git push` deploys automatically.

## 1. Create the resources (one time)

Authenticate the CLI first: `npx wrangler login`. Then:

```bash
npx wrangler d1 create arboritium
npx wrangler kv namespace create RATE_LIMIT
npx wrangler r2 bucket create arboritium-photos
```

Each command prints an ID. Put them into **`wrangler.toml`**:

- `d1_databases.database_id` → the D1 `database_id`
- `kv_namespaces.id` → the KV namespace `id`
- the R2 bucket name already matches (`arboritium-photos`)

Commit + push that change. (D1/KV IDs and the bucket name are identifiers, not
secrets — safe to commit.)

## 2. Set the secrets (one time, never committed)

```bash
npx wrangler secret put SITE_PASSWORD      # the family registration passphrase
npx wrangler secret put JWT_SECRET         # paste: openssl rand -base64 32
npx wrangler secret put MML_API_KEY        # your Maanmittauslaitos key (optional)
```

These attach to the deployed `arboritium` Worker. (You can also set them in the
dashboard: Workers → arboritium → Settings → Variables and Secrets.)
**Never set `LOCAL_ADMIN` in production** — that's what keeps `/admin/*` 404 for
the public.

## 3. Apply the database schema to the remote D1 (one time)

```bash
npx wrangler d1 migrations apply DB --remote
```

## 4. Deploy

`git push` to `main` → Workers Builds runs `pnpm build && npx wrangler deploy`.
The site is then at `https://arboritium.<your-subdomain>.workers.dev` (enable
the `workers.dev` route, or attach a custom domain).

## 5. Create the first property (admin runs locally, against remote data)

Admin is intentionally local-only. To manage **production** data, run the app on
your laptop pointed at the **remote** bindings:

1. In `.dev.vars` set `LOCAL_ADMIN=true` (plus the same secrets as prod).
2. Run `npx wrangler dev --remote` (this talks to the real D1/R2) and `pnpm dev`
   in another terminal — or just open the admin via the SPA dev server.
3. Go to `http://127.0.0.1:5173/admin/properties`, create a property (draw the
   boundary / pick hexes), and add your family members by email.

Because `LOCAL_ADMIN` is only ever set on your laptop, the deployed Worker has
no working admin endpoints.

## 6. Smoke test

1. On the deployed site, **Register** with the site password → you land on an
   empty property picker.
2. From your laptop admin (step 5), add yourself as a member of the property.
3. Reload the deployed site → the property appears; open it, drop a plant, add a
   photo, jot a cell note.
4. Install it: phone browser → "Add to Home Screen". Turn on airplane mode and
   reopen → previously-loaded plants/photos still render (offline read).

## Cost

€0/month on the free tier — see `claudedocs/infra-cost-review.md`.
