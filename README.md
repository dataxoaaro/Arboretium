# Arboretum Mapper

Personal plant-mapping PWA. Pick a property on a map, drop plants on H3 hex
cells, attach photos, view on mobile.

Stack: Vite + React 19 SPA, Cloudflare Workers (Hono) API, D1 (SQLite), R2,
KV, MapLibre GL with H3 indexing. Local-first — the whole stack runs on
`wrangler dev` with no Cloudflare account required.

Full spec: [`plans/arboretum_prd.md`](plans/arboretum_prd.md).
Implementation roadmap: [`plans/TODO.md`](plans/TODO.md).

---

## Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars       # local secrets (gitignored)
pnpm db:migrate                      # apply SQL migrations to local D1
pnpm seed                            # create admin@local / admin
pnpm start                           # worker + SPA together
```

Then open http://127.0.0.1:5173 and sign in:

- **email:** `admin@local`
- **password:** `admin`

The admin section lives at http://127.0.0.1:5173/admin (visible in the header
once you're signed in). Create a property there before adding plants.

### What `pnpm start` runs

| Process        | Port    | Purpose                         |
| -------------- | ------- | ------------------------------- |
| `wrangler dev` | `:8787` | Worker API + simulated D1/R2/KV |
| `vite` (SPA)   | `:5173` | The app — browse here           |

Both are managed by `concurrently`; Ctrl-C stops them together.

---

## Map tiles — registering an MML API key (optional, recommended for Finland)

Without a key the map falls back to free public tiles (OpenStreetMap for
street view, Esri World Imagery for satellite). With an MML
(_Maanmittauslaitos_ — Finnish National Land Survey) key the satellite layer
upgrades to MML's `ortokuva` orthophotos (~50 cm resolution for Finland,
freshly licensed) and street view uses MML `maastokartta` topographic tiles.

The key is free for personal/non-commercial use.

### Steps

1. **Register** at <https://omatili.maanmittauslaitos.fi/>
   (OmaTili — MML's account portal). Email + password, then click the
   verification link.

2. **Generate a key.** Once signed in, look for _API-avaimet_ / _API keys_
   in the side menu and create a new key. Copy the UUID-style value.

   When the portal asks about Referer / domain restrictions, you can leave
   it open for local dev. For a real deployment, restrict the key to your
   production domain.

3. **Add the key to `.dev.vars`** (gitignored, never commit it):

   ```
   MML_API_KEY=your-uuid-key-here
   ```

   The file lives at the repo root next to `.dev.vars.example`. If
   `.dev.vars` doesn't exist yet, copy the example first.

4. **Restart the worker.** Wrangler reads `.dev.vars` only at startup, so:

   ```bash
   pnpm start
   ```

   (or just `pnpm wrangler` if you're running the stack manually).

5. **Verify.** In the admin property editor (`/admin/properties/new`), click
   the _Satellite_ toggle — the bottom-right attribution should now read
   _© Maanmittauslaitos / NLS Finland_. To confirm without the UI:

   ```bash
   curl -s -b cookies.txt http://127.0.0.1:8787/map/config?layer=satellite | jq .source
   # → "mml-satellite"        (key working)
   # → "esri-satellite"       (no key, falling back to Esri)
   ```

### MML vs Esri — when each wins

The admin map has a 3-way toggle: **Street · Sat (MML) · Sat (Esri)**.

| Provider               | Resolution at z=18 | Max zoom           | Strength                                                                                 |
| ---------------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| **MML ortokuva**       | ~60 cm/pixel       | **18** (free tier) | Highest _native_ res for Finland; fresh ortophotos updated on a 2–5-year cycle           |
| **Esri World Imagery** | ~30 cm to ~1 m     | **19**             | Wider zoom range; sometimes sharper at very-high zoom because z=19 is real, not upscaled |

MML's free WGS84_Pseudo-Mercator matrix set tops out at zoom 18 — verified
via [WMTSCapabilities](https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/WMTSCapabilities.xml).
When you zoom past z=18 with MML selected, MapLibre upscales the z=18 tile and it gets blurry.
Esri serves real z=19 tiles in many areas, which often looks sharper at the
very-high zoom levels you'll use for placing individual plants.

**Practical recommendation:**

- Drawing a property boundary or scanning a wide area → **MML** (better source res)
- Placing individual plants at zoom 19+ → try both; **Esri** is often sharper at this scale
- If you don't have an MML key set, the _Sat (MML)_ button silently falls
  back to Esri and shows a small banner pointing back to this section.

### Notes

- The key is included in the tile URL as a query string, so it's visible to
  the browser. That's fine for an open-data WMTS — MML's terms allow this.
  If you ever want to hide the key (e.g. to enforce per-user rate limits),
  the worker can proxy tiles instead.
- Attribution is required by MML's licence; the worker already includes
  _© Maanmittauslaitos / NLS Finland_ in the tile config and MapLibre
  renders it bottom-right of the map.
- MML docs (English):
  <https://www.maanmittauslaitos.fi/en/rajapinnat/avoimien-aineistojen-rajapinnat>

---

## Other useful commands

```bash
pnpm typecheck           # tsc --noEmit
pnpm lint                # eslint
pnpm build               # SPA production build to dist/
pnpm db:migrate          # re-apply local D1 migrations
pnpm seed                # upsert admin@local user
pnpm admin:backup        # dump local D1 + R2 to backups/<timestamp>/
```

---

## Project layout

```
src/                  # SPA (React 19)
├── App.tsx           # router (public + protected + admin routes)
├── routes/           # main feature routes (Home, Login, Properties, ...)
├── admin/            # /admin/* — property + user + backup management UI
├── components/       # shared components (Map, AuthGuard, PlantSheet, ...)
└── lib/              # API client, auth context, h3 helpers, photo prep

worker/               # Cloudflare Worker (Hono)
├── index.ts          # routes mount + origin check + 404
├── routes/           # auth, map, admin, properties, plants, photos
└── lib/              # crypto (PBKDF2 + JWT), db helpers, rate limit

migrations/           # D1 SQL migrations (numbered)
scripts/              # node CLIs — backup.mjs, seed-dev.mjs
plans/                # PRD, TODO, schema diagram
```

---

## Production deployment

Not wired up yet. See `plans/TODO.md` ARB-E10 for the planned Cloudflare
Pages + Workers + D1 + R2 deploy. The local-first design means the SPA, the
worker, and the migrations are already production-shaped — only the bindings
in `wrangler.toml`, secrets via `wrangler secret put`, and the GitHub
Actions deploy job are missing.

The admin section ships in the production bundle. Access control is the
worker's `LOCAL_ADMIN` env var: `LOCAL_ADMIN=true` enables `/admin/*`
endpoints, anything else (or unset) returns 404. Production must never set
this variable.
