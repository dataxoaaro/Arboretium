# Arboretum Mapper — TODO

Implementation plan for the v1.0 MVP defined in [`arboretum_prd.md`](./arboretum_prd.md), organised as Linear/Jira-style **Epics** (phases) and **Issues** (single-PR-sized tasks).

## How to use

- Each Epic represents a logical phase of building the app. Epics are numbered `ARB-E0` … `ARB-E12`.
- Each Issue inside an Epic is sized for one PR (~half a day to two days). Issues use `ARB-XXX` codes, grouped in tens per epic.
- Mark issues as you finish them: `[ ]` → `[x]`. Use `[~]` for in-progress.
- Don't skip ahead — later epics depend on earlier ones (a hard dependency note appears under each epic when it exists).
- The PRD section in parentheses at the end of an issue tells you where to find the spec.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

**Current focus:** `ARB-E8` Cell notes & cell photos (E3..E7 done).

---

## ARB-E0 — Project bootstrap

Stand up the empty monorepo: package manager, Vite SPA shell, Worker shell, local D1+R2+KV, dev proxy. No real features yet, but `pnpm dev` and `pnpm wrangler dev` should both serve "hello world".

- [x] **ARB-001** — Initialize repo: `pnpm init`, `.gitignore`, `tsconfig.json`, root `package.json` with workspaces. _Done when:_ `pnpm install` succeeds in a clean clone. (§8.10)
- [x] **ARB-002** — Vite + React 19 + TypeScript scaffold under `src/`. _Done when:_ `pnpm dev` opens a "hello" page on `:5173`. (§8.2)
- [x] **ARB-003** — Tailwind v4 + shadcn/ui CLI initialised; install `Button`, `Input`, `Dialog`, `Sheet`, `Toast`. _Done when:_ a shadcn `Button` renders styled. (§8.2)
- [x] **ARB-004** — React Router v7 (declarative SPA) wired up with placeholder routes (`/`, `/login`, `/properties`). _Done when:_ navigating between routes works without reload. (§8.10)
- [x] **ARB-005** — Worker scaffold under `worker/` using Hono. _Done when:_ `pnpm wrangler dev` serves a `/health` endpoint on `:8787`. (§8.3)
- [x] **ARB-006** — `wrangler.toml` declares D1, R2, and KV bindings; bindings work in local mode. _Done when:_ `wrangler d1 execute --local DB --command "SELECT 1"` returns `1`. (§8.8)
- [x] **ARB-007** — Vite dev proxy: `/api/*` → `http://127.0.0.1:8787`. _Done when:_ a `fetch('/api/health')` from the browser hits the Worker. (§8.10)
- [x] **ARB-008** — Admin app scaffold under `admin/` (separate Vite config, binds `127.0.0.1:3001`, separate `package.json` script `pnpm admin`). _Done when:_ `pnpm admin` opens a placeholder page on localhost only. (§8.9)
- [x] **ARB-009** — Linting & formatting: ESLint flat config + Prettier + `tsc --noEmit` in CI. _Done when:_ `pnpm lint && pnpm typecheck` pass on the empty scaffold. (—)
- [x] **ARB-010** — GitHub Actions: build + lint on PRs. _Done when:_ a dummy PR shows a green check. (—)

---

## ARB-E1 — Database schema & migrations

Author the SQL migrations and apply them to the local D1 file. No business logic yet, just structure.

Depends on: `ARB-E0`.

- [x] **ARB-020** — Migration `001_users.sql` (`id`, `email` unique, `password_hash`, `display_name`, `created_at`). (§8.4)
- [x] **ARB-021** — Migration `002_properties.sql` (`id`, `owner_id`, `name`, `boundary_geojson`, `included_hexes`, `center_lat`, `center_lng`, `archived_at`, `created_at`, `updated_at`). (§8.4)
- [x] **ARB-022** — Migration `003_property_members.sql` (composite PK). (§8.4)
- [x] **ARB-023** — Migration `004_plants.sql` with indexes on `(h3_res15)` and `(property_id, archived)`. (§8.4)
- [x] **ARB-024** — Migration `005_cells.sql` (composite PK on `property_id, h3_res15`). (§8.4)
- [x] **ARB-025** — Migration `006_photos.sql` with the plant-or-cell `CHECK` constraint. (§8.4)
- [x] **ARB-026** — Migration `007_password_reset_tokens.sql` storing `sha256(token)` only. (§8.4, §8.7)
- [x] **ARB-027** — `pnpm db:migrate` script that runs `wrangler d1 migrations apply` against local + (gated) remote. _Done when:_ a fresh local DB has all tables. (§8.10)
- [x] **ARB-028** — Type-safe DB helper module `worker/lib/db.ts` (typed query wrappers, no ORM). (§8.10)
- [x] **ARB-029** — Optional: ER diagram (mermaid) committed to `plans/schema.md`. (—)

---

## ARB-E2 — Authentication

Worker endpoints + frontend pages for register/login/logout/change-password/reset-redeem, with KV-backed rate limits. No property creation yet — that lives in the admin tool.

Depends on: `ARB-E1`.

- [x] **ARB-030** — `worker/lib/auth.ts`: PBKDF2-SHA256 hashing (Web Crypto, 600k iters, per-user salt) + constant-time compare. (§8.7)
- [x] **ARB-031** — `worker/lib/auth.ts`: HMAC-SHA256 JWT sign/verify with 30-day expiry + sliding refresh. (§8.7)
- [x] **ARB-032** — `worker/lib/rate-limit.ts`: KV-backed counter (per-key TTL window). (§8.7)
- [x] **ARB-033** — `worker/lib/origin-check.ts` middleware: rejects state-changing requests from foreign origins. (§8.7, §9)
- [x] **ARB-034** — `POST /auth/register`: site-password gate, password length check (≥10), creates user, signs in. Rate-limited per IP. (§8.7)
- [x] **ARB-035** — `POST /auth/login`: constant-time hash compare with dummy hash on missing user, generic error, sets cookie. Rate-limited per email + per IP. (§8.7)
- [x] **ARB-036** — `POST /auth/logout`: clears cookie. (§8.7)
- [x] **ARB-037** — `POST /auth/change-password`: authenticated user changes own password. (§8.7)
- [x] **ARB-038** — `POST /auth/reset/:token`: redeems an admin-issued reset token (compares `sha256(token)`), sets new password. (§8.7)
- [x] **ARB-039** — Frontend `/login` page (form + error display + redirect on success). (§8.2)
- [x] **ARB-040** — Frontend `/register` page (with site-password field). (§8.2, §8.7)
- [x] **ARB-041** — Frontend `/reset/:token` page. (§8.7)
- [x] **ARB-042** — Auth guard on all protected routes; redirect unauthenticated users to `/login`. (§8.2)
- [x] **ARB-043** — Settings page with "Change password" form. (§6.5, §8.7)

---

## ARB-E3 — Local admin tool

The owner's local-only Vite app at `127.0.0.1:3001`. Talks to Cloudflare HTTP APIs (D1, R2) using a local API token. Property creation, user management, and backups all live here.

Depends on: `ARB-E1`. Can run in parallel with `ARB-E4` and `ARB-E5`.

> **Local-first re-design (May 2026):** the original E3 design had the admin tool calling the Cloudflare HTTP API directly. We pivoted to local-Worker admin endpoints gated by `LOCAL_ADMIN=true` so the whole stack runs on `wrangler dev` with no Cloudflare account. In production, `LOCAL_ADMIN` is never set so `/admin/*` returns 404. See `worker/routes/admin.ts`.
>
> **Admin folded into SPA (May 2026):** the standalone Vite admin app on `:3001` was deleted; admin pages now live in `src/admin/*` and mount under `/admin/*` in the main SPA router. There's no separate process, no `pnpm admin`, no extra origin. The `LOCAL_ADMIN` env-var gate is unchanged — the SPA always renders the admin pages, but the API calls 404 in production where `LOCAL_ADMIN` isn't set. ARB-061 (Pages-exclusion) is therefore N/A: admin code ships in the production bundle by design, and the Worker gate is the single source of access control.
>
> **Resolution unified at res-15 (May 2026):** the property hex picker (`AdminMap`) was originally res-13 while the plant validation (`worker/routes/plants.ts`) compared res-15 plant cells against `included_hexes` directly. That mismatch silently rejected every plant added through admin-created properties. Both sides now use res-15 (`RES_PICKER = RES_PLANT = 15`), with a 50,000-cell cap on the picker so a wildly-large polygon doesn't lock the browser.


- [x] **ARB-050** — _Re-scoped to local-Worker admin routes (LOCAL_ADMIN-gated)._ See `worker/routes/admin.ts`. (§8.9)
- [x] **ARB-051** — Admin shell: sidebar nav (Properties · Users · Backups). (§8.9)
- [x] **ARB-052** — Properties list page (active + archived). (§8.9)
- [x] **ARB-053** — Properties create form: name + map (MapLibre + MML WMTS) for polygon draw + hex picker. _Re-scoped to res-15_ (matches plants.h3_res15 and the schema comment). (§6.1, §8.9)
- [x] **ARB-054** — Properties edit form: rename, redraw boundary, edit included hexes. (§6.1, §8.9)
- [x] **ARB-055** — Properties archive button (sets `archived_at`); restore button to clear it. (§6.1)
- [x] **ARB-056** — Users list page (id, email, display_name, created_at, member-of properties count). (§8.9)
- [x] **ARB-057** — Users disable / remove (deletes from `users` and cascades from `property_members`). (§6.9, §8.9)
- [x] **ARB-058** — Generate password-reset link (creates row in `password_reset_tokens` with hashed token, returns clear-text URL once). (§8.7, §8.9)
- [x] **ARB-059** — Members admin: per-property "add by email" / "remove" actions writing to `property_members`. (§6.9, §8.9)
- [x] **ARB-060** — Backup command: dump D1 → SQLite file, sync R2 → local folder. _Done when:_ `pnpm admin:backup` produces a timestamped folder. (§8.9)
- [x] **ARB-061** — _Obsolete after admin-into-SPA consolidation._ The admin code now ships with the SPA bundle by design; access control is the worker's `LOCAL_ADMIN` env gate (never set in prod = `/admin/*` API returns 404). (§8.9)

---

## ARB-E4 — Map & H3 foundation

MapLibre with MML WMTS, h3-js utilities, hex visibility modes, GPS dot. No data integration yet — pure map mechanics.

Depends on: `ARB-E0`.

- [x] **ARB-070** — `lib/h3/index.ts`: `cellAtPoint`, `cellToParent`, `cellBoundary`, `cellsForViewport`. (§5)
- [x] **ARB-071** — `components/map/Map.tsx`: MapLibre instance with MML WMTS layer (key from `MML_API_KEY` Worker env, served via `/api/map-config`). (§8.5)
- [x] **ARB-072** — Hex grid overlay rendering at res 15 (zoomed in). (§5)
- [x] **ARB-073** — Coarse hex rendering at res 13/14 when zoomed out. (§5)
- [x] **ARB-074** — Hex visibility mode switcher: Off / Occupied only / Full. (§5)
- [x] **ARB-075** — Distinct colour for occupied cells in Full mode. (§5)
- [x] **ARB-076** — Persist mode preference per user (localStorage initially; `users.preferences` JSON column later if needed). (§5)
- [x] **ARB-077** — GPS dot + accuracy circle + compass heading arrow. (§6.2)
- [x] **ARB-078** — Property boundary outline rendering (from `boundary_geojson`). (§6.2)
- [x] **ARB-079** — Tap-cell handler emits `(h3_res15, lat, lng)` event. (§6.2)

---

## ARB-E5 — Property selection & shell

The signed-in user picks one of their properties; the rest of the app loads inside that property's context.

Depends on: `ARB-E2`, `ARB-E4`.

- [x] **ARB-090** — `GET /properties` Worker endpoint: returns active properties the user is a member of. (§8.3)
- [x] **ARB-091** — Property picker page (default route after login). (§6.1)
- [x] **ARB-092** — Empty state: "You're not a member of any property yet — ask the admin to add you." (§6.9)
- [x] **ARB-093** — Property layout with map view as default; route param `:propertyId` everywhere. (§6.2, §8.10)
- [x] **ARB-094** — Property switcher in app shell header. (§6.2)

---

## ARB-E6 — Plants CRUD

The core feature. Spatial-first lookup by h3, including resurfaced data from archived properties.

Depends on: `ARB-E4`, `ARB-E5`.

- [x] **ARB-100** — `GET /plants?property_id=…`: spatial-first query — `WHERE h3_res15 IN (property.included_hexes) AND archived = 0`. (§6.1, §8.3)
- [x] **ARB-101** — `POST /plants`: validates property membership, h3 ∈ included_hexes, persists. (§6.3, §8.3)
- [x] **ARB-102** — `PATCH /plants/:id`: validates the new h3 still lies in some property the user is a member of (enables move-to-different-cell). (§6.4, §8.3)
- [x] **ARB-103** — `DELETE /plants/:id`: soft delete (`archived = 1`). (§6.4)
- [x] **ARB-104** — Add-plant sheet/dialog triggered by tapping an empty cell or the "+" button. (§6.3)
- [x] **ARB-105** — Plant detail view (Info tab): all metadata, map snippet, audit info. (§6.5)
- [x] **ARB-106** — Edit-plant form. (§6.4)
- [x] **ARB-107** — Plant marker rendering on the map. (§6.2)
- [x] **ARB-108** — List view: sortable, filterable, count + species count header. (§6.8)
- [x] **ARB-109** — Search across `common_name`, `latin_name`, `notes`, `source`. (§6.8)
- [x] **ARB-110** — "Show on map" action from a list row → pans + highlights the cell. (§6.8)

---

## ARB-E7 — Photos

Direct browser → R2 upload via signed URL; auth-checked Worker proxy for serving; per-plant timeline.

Depends on: `ARB-E6`.

- [x] **ARB-120** — `lib/photos.ts`: read EXIF `taken_at` with exifr, then canvas-resize to 2048 px (drops EXIF on re-encode). (§6.7)
- [x] **ARB-121** — _Re-scoped to local-first:_ Worker-proxied multipart upload (`POST /photos`). Signed-URL-direct upload swap to land with prod cutover (ARB-E10). (§8.3)
- [x] **ARB-122** — `POST /photos` writes R2 + registers metadata in one round-trip. (§6.7, §8.3)
- [x] **ARB-123** — `GET /photos/:id`: auth-checked, streams from R2 through the Worker. (§8.3, §9)
- [x] **ARB-124** — Photo capture/upload UI in plant form (camera + gallery). (§6.7)
- [x] **ARB-125** — Plant detail "Timeline" tab: photos sorted by `taken_at`. (§6.5, §6.7)
- [x] **ARB-126** — Sort toggle (oldest first / newest first). (§6.5)
- [x] **ARB-127** — Recaption + delete photo actions. (§6.4, §6.7)

---

## ARB-E8 — Cell notes & cell photos

Hex-level metadata: notes that describe the location, photos of the spot itself.

Depends on: `ARB-E6`, `ARB-E7`.

- [ ] **ARB-140** — `POST /cells` / `PATCH /cells/:property_id/:h3` for notes; create-on-write semantics. (§8.3)
- [ ] **ARB-141** — `GET /cells/:property_id/:h3` — returns notes + plants + cell photos for a hex. (§6.6, §8.3)
- [ ] **ARB-142** — Cell detail sheet (mobile drawer / desktop modal). (§6.6)
- [ ] **ARB-143** — Cell-level photo upload (reuses ARB-122 with cell-target params). (§6.7)
- [ ] **ARB-144** — Cell-level note edit (free text). (§6.6)
- [ ] **ARB-145** — Cell metadata block (h3 index, parent res 14/13/12, lat/lng). (§6.6)
- [ ] **ARB-146** — Distinct map marker for "cell has photos / notes but no plants". (§6.2)

---

## ARB-E9 — PWA & offline read

Manifest, service worker, IndexedDB cache for read-only offline use. Write queue is v1.1.

Depends on: `ARB-E5`.

- [ ] **ARB-160** — `public/manifest.webmanifest` with name, icons, theme colour, display mode. (§8.6)
- [ ] **ARB-161** — `vite-plugin-pwa` configured (Workbox under the hood); SW registers in production. (§8.6)
- [ ] **ARB-162** — Map tile caching strategy (long TTL, network-first then cache). (§8.6)
- [ ] **ARB-163** — API GET caching strategy (stale-while-revalidate for `/properties`, `/plants`, `/cells`). (§8.6)
- [ ] **ARB-164** — `lib/db/dexie.ts`: schema for plants, cells, photo metadata. (§8.6)
- [ ] **ARB-165** — On successful API GET, write the response into Dexie. (§6.10)
- [ ] **ARB-166** — Offline read: when fetch fails, fall back to Dexie. (§6.10)
- [ ] **ARB-167** — Offline indicator in app shell (online/offline + last-sync timestamp). (§6.10)
- [ ] **ARB-168** — "Add to home screen" prompt on iOS Safari + Android Chrome. (§6.2)

---

## ARB-E10 — Deploy

First production deployment to Cloudflare. Requires a Cloudflare account.

Depends on: `ARB-E2` minimum (auth must work end-to-end before deploying).

- [ ] **ARB-180** — Cloudflare account: create Workers + Pages projects, D1 database, R2 bucket, KV namespace. (§8.8)
- [ ] **ARB-181** — Apply migrations to remote D1. (§8.8)
- [ ] **ARB-182** — `wrangler secret put SITE_PASSWORD` (4–6-word passphrase). (§8.7)
- [ ] **ARB-183** — `wrangler secret put JWT_SECRET` (cryptographically random 32+ bytes). (§8.7)
- [ ] **ARB-184** — `wrangler secret put MML_API_KEY`. (§8.5)
- [ ] **ARB-185** — First Worker deploy via `wrangler deploy`. (§8.8)
- [ ] **ARB-186** — Connect Pages to GitHub; verify auto-deploy on `main`. (§8.8)
- [ ] **ARB-187** — Confirm long random `*.pages.dev` subdomain (URL obfuscation). (§8.8)
- [ ] **ARB-188** — Smoke test in production: register first user → admin creates property locally → user logs in and sees property. (§8.7, §8.9)
- [ ] **ARB-189** — PWA install on a real phone; verify offline read works. (§6.10)
- [ ] **ARB-190** — Optional: custom domain. (§8.8)

---

## ARB-E11 — Polish & MVP launch

Last-mile checks before declaring v1.0 done.

- [ ] **ARB-200** — Accessibility pass: tap targets ≥44 px, contrast ratios, focus rings, keyboard nav. (§7)
- [ ] **ARB-201** — Mobile QA on iOS Safari + Android Chrome (camera capture, install, offline). (§7)
- [ ] **ARB-202** — Sunlight readability: high-contrast theme variant or auto-boost in bright environments. (§7)
- [ ] **ARB-203** — Per-user export: `GET /export/:propertyId` streams a ZIP of plants CSV + photos. (§8.3, §9)
- [ ] **ARB-204** — Empty states everywhere (no plants, no photos, no properties). (§6)
- [ ] **ARB-205** — Error boundaries + Sonner toasts for Worker errors. (§7)
- [ ] **ARB-206** — First real-cottage walkthrough; capture a bug list. (§7)
- [ ] **ARB-207** — Triage and fix MVP-blocking bugs from ARB-206. (—)

---

## ARB-E12 — Post-MVP (v1.1 and beyond)

Outline only — flesh out into Issues when MVP is shipped.

### v1.1

- [ ] Offline write queue: capture POST/PATCH/DELETE while offline; replay on reconnect; LWW conflict resolution; "review" UI for significant conflicts. (§6.10, §11)
- [ ] Photo side-by-side comparison (oldest vs newest; pick any two). (§6.7, §11)
- [ ] Custom zone names (rename parent res-12/13 hex regions). (§11)
- [ ] GeoJSON / CSV / ZIP export improvements. (§11)
- [ ] JWT revocation via `users.token_version`. (§8.7)
- [ ] Audit log: failed logins, password changes, member changes. (§9)

### v1.2

- [ ] Plant care reminders (water / fertilize / prune). (§11)
- [ ] Phenology notes (leaf-out / flowering / fruiting). (§11)
- [ ] Latin-name autocomplete from a plant-name database. (§11)

### Possible future

- [ ] Public read-only share link per property. (§11)
- [ ] Edit history view per record. (§11)
- [ ] Tags and custom fields per plant. (§11)
- [ ] Hard-delete admin command (wipes archived properties + their cells/plants/photos). (§6.1)

---

## Cross-cutting (do throughout)

These don't belong to a single epic — practice them every PR.

- [ ] Each Worker endpoint adds a unit test covering happy path + auth failure + bad input.
- [ ] Each non-trivial component has a brief story / preview, even if just a route in dev.
- [ ] No secrets in the repo; `.env.local` files always gitignored.
- [ ] Every new table touches a migration file (numbered sequentially).
- [ ] PR description references the ARB-XXX issue code being closed.
