# Arboretum Mapper — Product Requirements Document

**Version:** 0.4
**Author:** Personal project
**Last updated:** June 2026

> v0.4 reconciles the spec with the implemented design (E0–E7): site-password
> auth (no magic links / email invites), admin pages folded into the SPA and
> gated by `LOCAL_ADMIN` (no standalone tool / Cloudflare HTTP API), and
> Worker-proxied photo uploads (no signed URLs). See `plans/TODO.md` for the
> per-epic status and `docs/adr/` for recorded decisions.

---

## 1. Purpose

A personal web app to document plants and trees on a private property, using a satellite map and the H3 hexagonal grid system as the spatial backbone. Designed primarily for a summer cottage arboretum, but built to scale down to smaller plots (single-family house gardens) without changes.

Each plant is anchored to a small hexagonal cell on the map. Hex cells act as both visual organizers and quasi-identifiers for plants, while still allowing multiple plants per cell when needed.

## 2. Goals

- Document every plant and tree on a property with location, species, photos, and notes
- Navigate the property by tapping cells on a satellite map, not by GPS precision
- Support multiple properties per user (cottage + house)
- Allow family members to view and edit shared properties
- Track plant changes over time via a photo timeline
- Run free or near-free for personal use
- Work offline at the cottage with poor connectivity
- Be installable on a phone like a native app (PWA)

## 3. Non-goals

- Not a commercial arborist tool
- Not a citizen-science platform
- No species identification AI (manual entry only)
- No background GPS tracking, no AR
- No native iOS or Android app
- No drone orthophoto support
- No automatic duplicate detection (the map shows existing plants visibly enough)

## 4. Users

- **Primary:** the property owner, on phone in the garden and on laptop at home
- **Secondary:** family members who help maintain the arboretum
- All users with access to a property have full edit rights (no role distinctions in v1)

## 5. Spatial model

### H3 hex grid

Every plant is anchored to an H3 cell. The grid is hierarchical, so cells nest cleanly at every resolution.

| Resolution | Edge   | Area    | Role in app                                                                     |
| ---------- | ------ | ------- | ------------------------------------------------------------------------------- |
| 15         | ~0.5 m | ~0.9 m² | **Default cell.** One plant per cell in normal use.                             |
| 14         | ~1.3 m | ~6 m²   | **Grouping / zoom out.** Used to cluster res 15 cells visually when zoomed out. |
| 13         | ~3.5 m | ~44 m²  | **Property zones.** Garden zones at small scale.                                |
| 12         | ~9 m   | ~307 m² | **Wide zones.** "Northwest corner," "by the sauna."                             |

### Storage

Each plant record stores its `h3_index` at resolution 15 only. All coarser cells (14, 13, 12) are derived on the fly via H3's `cellToParent()`. No duplicated data.

### Hex visibility

Hex grid visibility has **three preset modes**, switchable from the map UI:

- **Off** — no grid overlay at all; only the satellite imagery and plant markers are visible
- **Occupied only** — only cells that contain at least one plant (or cell-level photo/note) are outlined; coarser parent cells (res 13/14) are used when zoomed out for clustering
- **Full** — the entire res 15 grid is shown for the visible area, with **occupied cells colored distinctly** from empty ones so used vs unused space is obvious at a glance

When zoomed out, the grid automatically uses a coarser resolution (res 13/14) regardless of mode, to avoid rendering thousands of hexes. The mode setting persists per user.

### Hex content

A hex cell can contain:

- **Zero plants** (empty cell)
- **One plant** (the typical case at res 15)
- **Multiple plants** (allowed, e.g., a cluster of bulbs or a planting bed)
- **Photos attached to the cell itself** (not tied to any specific plant) — useful for documenting bare spots, soil conditions, planting beds, or general garden areas

## 6. Functional requirements

### 6.1 Property setup

A property boundary is **required** — it scopes the H3 grid, the map view, and the offline cache.

**Property creation, editing, and archiving are admin-only and happen via the `LOCAL_ADMIN`-gated admin pages, not from the deployed web UI** (see §8.9). This is intentional: it removes the single biggest data-exposure risk (any registered user creating a property over someone else's hexes and reading their data via spatial lookup). The deployed app's web UI never exposes "Create property" or "Edit boundary" to anyone.

The admin tool runs locally on the owner's laptop and walks the admin through:

1. Navigate the map to the property location (or use the laptop's GPS via the browser)
2. Name the property (e.g., "Summer cottage", "House garden")
3. Define the boundary using **one or both** of:
   - **Drawing a polygon** on the map (click to place vertices, double-click to close)
   - **Picking hexagons** at res 13 to include the property's actual usable area
   - **Entering coordinates** directly (center + radius, or bounding box) as a quick alternative
4. Assign an owner (any registered user, by email)
5. Optionally add initial members
6. Submit — the `LOCAL_ADMIN`-gated admin endpoints write the rows to D1 (the local SQLite file in dev; the production DB once deployed)

The web UI shows the property picker (one's own active properties), and once a property is selected, the map view, list view, plant detail, etc. — but never the create/edit/archive flow.

#### Property deletion (soft delete with hex preservation)

Archiving is also admin-only via the local tool. When a property is archived:

- The row in `properties` gets an `archived_at` timestamp and disappears from the property picker for all members
- **No cells, plants, or photos are removed** — the data persists for safety and recovery
- If the admin later creates a new property whose `included_hexes` overlap an archived property's, the old plants / cell notes / photos at those hexes resurface inside the new property's view

This is implemented as **spatial-first lookup**:

- Plants, cell notes, and photos are anchored to an H3 cell (`h3_res15`)
- A property's "what's in me" query is `WHERE h3_res15 IN (property.included_hexes)` — driven by the cell, not by the row's original `property_id`
- The `property_id` column is kept for audit only (who created the row, in which property)

Because property creation is admin-gated, a malicious registered user cannot weaponize this lookup to harvest old data — they have no way to create a property at all.

A future "hard delete" admin command (not in MVP) would also wipe the underlying cells, plants, and photos.

### 6.2 Map view (primary screen)

- Satellite or aerial imagery as base layer
- Property boundary outlined
- H3 grid overlay (visibility scales with zoom — see Section 5)
- User's current GPS position shown as a dot with accuracy circle
- Compass heading shown as a small arrow on the dot
- Cells with plants are filled or marked
- Cells with attached photos (but no plants) are marked differently
- Tap a cell → opens cell detail (plants + cell-level photos)
- Tap empty cell → option to add a plant or attach a photo to the cell
- Pan, zoom, rotate; toggle grid visibility

### 6.3 Adding a plant

- Triggered by tapping a cell on the map, or "+" button
- Form fields:
  - Common name (required)
  - Latin name (optional)
  - Plant type (tree / shrub / perennial / annual / other)
  - Planted date (optional)
  - Source / origin (optional)
  - Notes (free text)
  - Photos (zero or more, see Section 6.7)
- On save: plant is anchored to the selected cell at res 15

### 6.4 Editing and deleting a plant

- Open plant detail → edit button
- All fields editable, including location (move to a different cell by tapping a new one)
- Photos can be added, removed, or recaptioned
- Soft delete: plant is archived, recoverable from a "deleted plants" view
- Hard delete option after archive

### 6.5 Plant detail view

- All metadata
- Photo carousel sorted by date (oldest to newest, or newest first — toggleable)
- Map snippet showing the cell location
- Created and last edited timestamps and the user who made the change
- Edit and delete buttons

### 6.6 Cell (hex) detail view

- Opens when a cell is tapped
- Shows:
  - All plants in this cell
  - Cell-level photos (photos attached to the hex itself, not to any plant)
  - Cell metadata (H3 index, parent cells at res 14/13/12, coordinates)
  - Cell notes (free-text, e.g., "rocky soil", "heavy shade") — included in MVP
- Actions:
  - Add plant to this cell
  - Add photo to this cell (without attaching to a plant)
  - Edit cell notes

Both **plants and cells** can carry their own notes and photos:

- **Plant** — notes + photo timeline that follow the plant (move with it if relocated)
- **Cell** — notes + photos describing the location itself (soil, shade, "before planting" shots, general garden views)

### 6.7 Photos

#### Attachment model

A photo can be attached to **either** a plant **or** a cell (hex), but not both. This keeps the data model clean:

- **Plant photos**: photos _of_ a specific plant, used in its timeline
- **Cell photos**: photos of a hex location (e.g., "this corner before planting", "soil close-up", "general view of bed")

#### Capture and upload

- Captured via device camera or uploaded from gallery
- **Only the resized version is kept** — max 2048 px on long edge, ~80% JPEG quality. Originals are discarded after resize to halve storage cost; if a higher-fidelity record is needed later, the user can re-upload.
- `taken_at` extracted from EXIF _before_ the resize, persisted as a column
- EXIF stripped during the client-side resize (canvas re-encode drops all metadata) so original GPS coordinates never leave the device
- Stored in object storage (provider chosen with the rest of the stack)
- Each photo has: optional caption, taken-at date, uploaded-at timestamp, uploader

#### Photo timeline (per plant)

- On a plant's detail view, a "Timeline" tab shows all photos sorted by `taken_at` date
- Visualizes plant growth and changes over time
- Each entry: photo, date, caption, who uploaded it
- Optionally a side-by-side comparison view (oldest vs newest, or pick any two)

### 6.8 List view and search

- Sortable list of all plants in the current property: by name, planted date, added date, zone, last edited
- Filter by plant type, by zone (parent hex at res 12 or 13)
- Search by common name or Latin name
- Tap to open detail
- Header shows total count and species count (e.g., "47 plants, 12 species")

### 6.9 Family access

Designed for ~5 users total. Registration is gated by a single **site password** — a shared secret the admin sets once and gives to family members through whatever channel they prefer.

- Anyone who knows the site password can register their own account (email + personal password + display name)
- A registered user with no property memberships sees an empty property picker — registration alone grants no access to any data
- The **admin** uses the `LOCAL_ADMIN`-gated admin pages (§8.9) to assign registered users as members or owners of specific properties
- Property members have full edit rights (add, edit, delete plants, cell notes, photos) on properties they belong to
- Each plant, cell note, and photo records `created_by` and `last_edited_by` for accountability
- A property has exactly one owner; ownership transfers happen via the admin tool
- Password recovery: a user can change their own password from settings while logged in. If a user forgets their password, the admin generates a one-time reset link via the admin tool and shares it manually; the link expires in 24h and is single-use.
- Account removal: the admin removes a user from `users` and `property_members` via the admin tool; their existing edits stay attributed to them in the audit trail.
- The site password can be rotated at any time by changing the `SITE_PASSWORD` Worker secret — only affects future registrations; existing users keep their accounts

### 6.10 Offline support

- App shell, code, and previously loaded map tiles cached via service worker
- Local plant data and photos cached for the active property
- Edits made offline are queued and synced when connection returns
- Visual indicator when offline or when sync is pending
- Conflict policy: last-write-wins per field; conflicts surfaced in a small "review" UI when significant

## 7. Non-functional requirements

- **Mobile-first**: primary use case is phone in the garden
- **Performance**: map and plant list usable within 2 seconds of cold load
- **Offline-capable**: full read access offline, write queued
- **Accessible**: works with one hand, large tap targets, readable in sunlight
- **Resilient**: nothing lost if app crashes mid-edit (autosave to local storage)

## 8. Technical architecture

### 8.1 Stack overview

| Layer              | Choice                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language           | TypeScript                                                                                                                                              |
| Framework          | Vite + React 19 SPA                                                                                                                                     |
| Routing            | React Router v7 (declarative SPA mode)                                                                                                                  |
| UI components      | shadcn/ui (Radix + Tailwind, copied into repo)                                                                                                          |
| Styling            | Tailwind CSS v4                                                                                                                                         |
| Forms              | Plain controlled inputs + zod schemas (validation only)                                                                                                 |
| Map                | MapLibre GL JS                                                                                                                                          |
| Map tiles          | MML WMTS (Finland only)                                                                                                                                 |
| Spatial            | h3-js                                                                                                                                                   |
| Local state        | Zustand (single small store)                                                                                                                            |
| Local data         | Dexie.js (IndexedDB wrapper)                                                                                                                            |
| API / backend      | Cloudflare Workers + Hono (lightweight router)                                                                                                          |
| Database           | Cloudflare D1 (managed SQLite)                                                                                                                          |
| Object storage     | Cloudflare R2 (photos, free egress)                                                                                                                     |
| Rate limiting      | Cloudflare KV (per-IP and per-email login/registration limits)                                                                                          |
| Admin tool         | Admin pages bundled in the SPA under `/admin/*`, gated by the `LOCAL_ADMIN` Worker env var (endpoints 404 in production)                                |
| Auth               | Email + password (PBKDF2 via Web Crypto), signed JWT in HTTP-only cookie. Site password gates self-registration; admin manages everything else locally. |
| Offline            | vite-plugin-pwa (Workbox-based service worker)                                                                                                          |
| Photo processing   | Client-side canvas resize (drops EXIF on re-encode) + exifr (read `taken_at` before resize)                                                             |
| Hosting (frontend) | Cloudflare Pages                                                                                                                                        |
| Hosting (API)      | Cloudflare Workers                                                                                                                                      |
| Repo               | GitHub                                                                                                                                                  |
| Package manager    | pnpm                                                                                                                                                    |
| Local dev          | `vite` (frontend) + `wrangler dev` (Workers + local D1 + local R2)                                                                                      |

### 8.2 Frontend (Vite SPA + shadcn/ui)

**Vite + React 19 SPA** for:

- Single static bundle, no SSR — the whole app is delivered as static assets and runs entirely in the browser
- React Router v7 (declarative mode) for client-side routing
- One Zustand store for cross-screen state (active property, hex visibility mode, offline queue)
- Direct `fetch` calls to the Workers API; no TanStack Query for v1
- Plain `<form>` elements with controlled inputs; zod schemas validate before submission and on the server side too

**shadcn/ui** components used (installed via the CLI, source lives in `src/components/ui/`):

- `Button`, `Input`, `Textarea`, `Label`, `Select`, `Checkbox` — forms
- `Dialog` — desktop modals
- `Sheet` and `Drawer` — mobile slide-up panels for plant/cell details
- `Tabs` — plant detail (Info / Timeline)
- `Card` — plant list items
- `Toast` (Sonner) — save confirmations

The shadcn list is intentionally trim. `Command`, `Calendar`, `Avatar`, `Skeleton`, `Tooltip`, `DropdownMenu` are deferred — native HTML controls (`<input type="date">`, `<details>`) cover their MVP use cases.

### 8.3 Backend (Cloudflare Workers + D1 + R2)

A single Cloudflare Worker exposes a small REST API (built on Hono). Admin endpoints (`/admin/*`) **exist in the Worker but are gated by the `LOCAL_ADMIN` env var** — it is set only in local dev, so every `/admin/*` call returns 404 in production (§8.9). The public surface:

- **`POST /auth/register`** — requires `site_password` field matching the `SITE_PASSWORD` Worker secret, plus email + personal password + display name; creates the user. Rate-limited per IP.
- **`POST /auth/login`** — verifies email + password, sets a signed JWT cookie. Rate-limited per email and per IP.
- **`POST /auth/logout`** — clears the cookie
- **`GET /auth/me`** — returns the current user (clears the cookie + 401 if the user no longer exists)
- **`POST /auth/change-password`** — authenticated user changes their own password
- **`POST /auth/reset/:token`** — redeems an admin-issued one-time reset link
- **`GET /properties` / `GET /properties/:id`** — lists / fetches the current user's active (non-archived) properties; no create / edit / archive endpoints on the public surface
- **`GET / POST / PATCH / DELETE /plants[...]`** — CRUD on plants the user has access to
- **`GET /map/config`** — auth-checked MapLibre raster source (MML if a key is set, else OSM/Esri)
- **`POST /photos`** — multipart upload: the Worker writes the bytes to R2 and registers metadata in one round-trip (local-first; a signed-URL direct upload can swap in at the production cutover without touching the SPA)
- **`GET /photos?plant_id=…`** — a plant's photo timeline; **`PATCH /photos/:id`** recaptions; **`DELETE /photos/:id`** removes the row + R2 object
- **`GET /photos/:id`** — auth-checked, streams the photo bytes from R2 through the Worker (private; no public R2 bucket)
- _Planned:_ `GET / POST / PATCH / DELETE /cells[...]` (cell notes, E8) and `GET /export/:propertyId` (ZIP export, E11) — not yet implemented.

**D1 (managed SQLite)** holds all relational data — see schema in §8.4. Authorization is enforced inside each handler: the JWT identifies the user, and every handler checks property membership before touching data. Map view queries use **spatial-first lookup** (see §6.1): `WHERE h3_res15 IN (selected_property.included_hexes)` rather than `WHERE plants.property_id = ?`, which is what lets archived-property data resurface under a new property covering the same hexes.

**R2** holds resized photos. In the local-first design the bytes are POSTed to the Worker, which writes them to R2 (`wrangler dev`'s simulated R2 doesn't model signed-URL PUTs the way production does). The auth-checked `GET /photos/:id` streams them back; the bucket is never public. R2 egress is free, so serving photos to family members costs nothing.

Realtime collaboration is out of scope for v1.

### 8.4 Database schema

D1 is SQLite under the hood, so the schema uses `TEXT` for IDs (UUIDs generated client- or worker-side), `INTEGER` for timestamps (unix epoch ms), and standard foreign keys.

```
users
  id, email (unique, lowercased), password_hash,
  display_name, created_at

properties
  id, owner_id (fk users), name,
  boundary_geojson (text), included_hexes (text, JSON array of h3 indices),
  center_lat, center_lng,
  archived_at (nullable),    -- soft-delete marker; keeps cells/plants/photos intact
  created_at, updated_at

property_members
  property_id (fk), user_id (fk),
  added_by, added_at
  -- presence in this table = full edit access in v1
  PRIMARY KEY (property_id, user_id)

password_reset_tokens
  token (primary key, ~32-char random),
  user_id (fk users), issued_by (fk users),
  created_at, expires_at, consumed_at (nullable)

plants
  id, property_id (fk),       -- "first-property-of-record"; not used for view queries (see §6.1)
  h3_res15 (text, indexed),
  lat, lng,
  common_name, latin_name, plant_type,
  planted_date, source, notes,
  archived (integer 0/1, default 0),
  created_by, created_at,
  last_edited_by, updated_at

cells
  -- cell-level metadata, only inserted when there's something to store
  property_id (fk),           -- attribution only; lookups join via h3_res15
  h3_res15 (text), notes,
  created_at, updated_at
  PRIMARY KEY (property_id, h3_res15)

photos
  id,
  plant_id (fk, nullable),
  cell_property_id (fk, nullable),
  cell_h3_res15 (nullable),
  r2_key (text, e.g. "properties/<id>/photos/<id>.jpg"),
  caption, taken_at, uploaded_at, uploaded_by
  CHECK (plant_id IS NOT NULL OR (cell_property_id IS NOT NULL AND cell_h3_res15 IS NOT NULL))
```

Indexes: `plants(h3_res15)` (drives spatial-first lookup), `plants(property_id, archived)` (for "all my plants" view), `photos(plant_id)`, `photos(cell_h3_res15)`, `password_reset_tokens(user_id)`.

### 8.5 Map tiles

- **MML (Maanmittauslaitos) aerial imagery via WMTS** — free for non-commercial use, register at avoindata.maanmittauslaitos.fi for an API key. Sole tile source; the app is Finland-only by design.
- Tiles are aggressively cached client-side via the service worker so repeat visits to the same property work offline.

### 8.6 PWA / offline

- `vite-plugin-pwa` generates the service worker (Workbox under the hood) and the Web App Manifest at build time
- Service worker caches: app shell, JS/CSS bundles, recent map tiles (long TTL, network-first then cache), recent plant data (stale-while-revalidate)
- `Dexie.js` wraps IndexedDB for typed local storage of plants, cell notes, photo thumbnails, and (in v1.1) the offline edit queue
- Web App Manifest for "add to home screen" with proper icons and theme color — installable on iOS and Android
- Offline indicator in the header when network is unavailable

### 8.7 Authentication

The simplest auth that works for ~5 users: a single shared **site password** gates self-registration; once registered, each user has a normal email + password account. **No email is sent** — no magic links, no password-reset emails, no SMTP integration. Property and member management is admin-only, via the `LOCAL_ADMIN`-gated admin pages (§8.9); those endpoints return 404 in production.

**Site password (registration gate)**

- Stored as Cloudflare Worker secret `SITE_PASSWORD`, set with `wrangler secret put SITE_PASSWORD`
- Should be a 4–6-word passphrase (e.g., `tile-otter-summer-rake`), not a short word
- Compared in constant time on registration; rotation only affects new registrations
- A registered user with no property memberships sees nothing — registration alone is not access

**Registration**

1. User opens `/register`
2. Fields: `email`, `password` (≥10 chars), `display_name`, `site_password`
3. Worker constant-time compares `site_password`; rejects on mismatch with the same generic error used for rate-limit-exceeded so site-password presence/absence isn't enumerable
4. Personal password hashed with **PBKDF2-SHA256** via Web Crypto (600k iterations, per-user random salt)
5. User row inserted; user signed in

**Login**

1. Fields: `email`, `password`
2. Worker fetches user (timing-leveled with a constant dummy hash if user doesn't exist, to prevent account enumeration)
3. Verifies hash; on success sets a JWT (HMAC-SHA256-signed with `JWT_SECRET`) as an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. 30-day expiry, sliding refresh.
4. On failure: a generic "invalid email or password" error — never reveals which field was wrong

**Rate limiting (KV-backed)**
A single Cloudflare KV namespace (`RATE_LIMIT`) tracks counts and lockouts:

| Endpoint              | Key                   | Limit       | Window | Action on breach                                       |
| --------------------- | --------------------- | ----------- | ------ | ------------------------------------------------------ |
| `POST /auth/login`    | `login:email:<email>` | 5 failures  | 15 min | Reject for the rest of the window with a generic error |
| `POST /auth/login`    | `login:ip:<ip>`       | 20 failures | 15 min | Same                                                   |
| `POST /auth/register` | `register:ip:<ip>`    | 10 attempts | 1 hour | Same                                                   |

KV writes consume free-tier budget (1k/day): worst-case (5 family members, occasional bot probes) stays well below the cap. KV is shared across all Worker isolates, unlike module-scope state.

**CSRF / origin protection**

- JWT cookie uses `SameSite=Strict` (the app and API share an origin via Cloudflare Pages routing, so this works)
- All state-changing endpoints additionally check the `Origin` header matches the allowed Pages domain
- This avoids needing an explicit CSRF token table

**Password reset (no email)**

- Logged-in user changes their own password from _Settings_
- If forgotten: admin issues a one-time reset link from the local admin tool. The link is `https://<host>/reset/<token>`. The token in the URL is the cleartext, but the DB stores `sha256(token)` — a DB read leak does not yield working links. Single-use, expires in 24h.

**Session storage**
JWT in HTTP-only, `Secure`, `SameSite=Strict` cookie. Stateless. No revocation in v1 (acceptable: the data isn't a high-value target; if a laptop is lost, the admin can change that user's password, which the app accepts but the old JWT remains valid until expiry — for a hobby app this is fine).

**Defense-in-depth: URL obfuscation**
The deployed app lives at a non-discoverable URL — either a long random `*.pages.dev` subdomain or a custom domain that isn't published anywhere. The admin shares the URL alongside the site password. This is _not_ a primary security control (it's security-through-obscurity), but it meaningfully reduces drive-by traffic and bot probes hitting `/auth/login`.

**Why this is the simplest viable model**

- **No email infrastructure** — saves a dependency, account, free-tier limit, and delivery-failure mode
- **No third-party auth provider** — no Auth0 / Clerk / Supabase Auth bill or platform pause
- **No admin endpoints on the public Worker** — admin operations bypass the public surface entirely
- **Total auth code: ~180 lines** in the Worker (register, login, logout, change-password, reset-redeem, rate-limit middleware) plus PBKDF2 + JWT helpers

### 8.8 Hosting & deployment

Everything lives on **Cloudflare's free tier** — there is no platform-pause to worry about (unlike Supabase Free), and R2's free egress means photo bandwidth costs nothing.

> **Implementation note (June 2026):** deployment uses a **single Worker that
> serves both the SPA (static assets) and the API** on one origin, via
> Cloudflare Workers Builds (Git integration) — superseding the separate
> Pages-project plan below. See **ADR-0003** and
> `claudedocs/deploy-checklist.md`. (Cost is unchanged: €0/mo.)

- **Cloudflare Pages** (free) — hosts the Vite-built static SPA
  - GitHub integration: every push to `main` deploys to production, every PR gets a preview URL
  - Unlimited static requests, 500 builds/month
- **Cloudflare Workers** (free) — hosts the API
  - 100k requests/day, 10ms CPU per request — far above what a personal app needs
  - Deployed via `wrangler deploy` (or via a simple GitHub Action)
- **Cloudflare D1** (free) — SQLite; 5 GB account storage, **500 MB per database** on the free plan (10 GB on paid), ample for relational data. Photos stay in R2, never in D1 (see ADR-0002).
- **Cloudflare R2** (free up to 10 GB) — photo storage with **free egress**; resized photos at 2048 px ~300–500 KB each fit ~20–30k photos
- **Cloudflare KV** (free) — small namespace for rate-limit counters; ~1k writes/day free is plenty for ~5 users
- **Domain**: deployed to a long random `*.pages.dev` subdomain (e.g., `arboretum-x9a2b3c4d5.pages.dev`) for URL-obfuscation; the subdomain is shared only with family members alongside the site password. Optional custom domain (~€10/year) if a friendlier URL is wanted; Cloudflare DNS is free
- **Worker secrets** (`SITE_PASSWORD`, `JWT_SECRET`, MML API key) managed via `wrangler secret put <NAME>` — never in the repo
- **Admin access** is the `LOCAL_ADMIN` env var, set only in the local `.dev.vars`; production never sets it, so `/admin/*` returns 404. No Cloudflare API token is needed.

### 8.9 Local admin tool

> **Implementation note (May 2026):** the original design ran the admin tool as a
> standalone Vite app on `:3001` that talked to the Cloudflare HTTP API directly.
> That was replaced by admin pages folded into the SPA (`src/admin/*`, mounted at
> `/admin/*`) calling Worker endpoints gated by `LOCAL_ADMIN`. The sections below
> describe the implemented design.

Property creation/editing/archiving and user/member management are **not usable on the deployed app**. The admin pages ship in the production bundle, but every `/admin/*` Worker endpoint returns 404 unless the `LOCAL_ADMIN` env var is `"true"` — and it is set only in the local `.dev.vars`, never in production. So the deployed app exposes the admin UI shell but no working admin API: a leaked site password gives an attacker an account but no data and no way to grant access.

**What it does**

- Add / edit / archive / restore properties (map + polygon + hex-picker UX via `AdminMap`)
- Assign property owner and members (add by email / remove)
- List / hard-delete user accounts
- Generate one-time password-reset links to share manually
- Inspect DB stats (counts of users, properties, plants, photos)
- Backup: dump D1 → SQL file + copy local R2 state to a folder (CLI, see below)

**How it's built**

- Lives in `src/admin/*` in the SPA; mounted under `/admin/*` in the React Router config — no separate process, port, or origin
- Calls the Worker's `/admin/*` endpoints (`src/admin/admin-api.ts`), which are gated by `LOCAL_ADMIN` (`worker/routes/admin.ts`)
- Runs entirely on `wrangler dev` + `vite` — no Cloudflare account or API token needed for day-to-day admin work

**How it stays safe**

- **Single gate** — `LOCAL_ADMIN` is the one source of access control; unset in production = `/admin/*` returns 404. The SPA admin pages render but their API calls fail.
- **No prod admin path** — production must never set `LOCAL_ADMIN`; there is no other way to reach the admin operations.
- **Local dev binds to `127.0.0.1`** — not exposed on the network during development.

**Backup story (separate CLI)**

- `pnpm admin:backup` (`scripts/backup.mjs`) dumps the D1 database to a timestamped SQL file and copies the local R2 state directory into `backups/<timestamp>/`
- Run before any risky operation (boundary changes, archives) and on a regular schedule
- This addresses the lack of automatic point-in-time recovery on D1 free tier. The Backups admin page shows current DB stats and the command to run.

### 8.10 Local development

The whole stack runs offline on the developer's laptop with no cloud account required for day-to-day work:

```
pnpm dev          # Vite dev server (frontend) on :5173
pnpm wrangler dev # Workers + local D1 (SQLite file) + local R2 emulation on :8787
```

- **Local D1** = a real SQLite file under `.wrangler/state/`, queryable with any SQLite GUI; migrations run via `wrangler d1 migrations apply`
- **Local R2** = a folder under `.wrangler/state/`; the same signed-URL upload flow works against it
- The Vite dev server proxies `/api/*` to `wrangler dev` so the frontend talks to the local Worker exactly as it will in prod
- Deploy when ready: `pnpm wrangler deploy` (Workers) + a `git push` (Pages auto-builds)

This keeps the inner-loop fast and means the cloud is only touched when actually deploying.

### 8.11 Folder structure (as built)

```
src/                          -- Vite SPA frontend (deployed)
  main.tsx                    -- app entry
  App.tsx                     -- router: public + protected + admin routes
  routes/
    Home.tsx Login.tsx Register.tsx ResetPassword.tsx
    Properties.tsx            -- property picker (default after login)
    PropertyLayout.tsx        -- /properties/:propertyId shell (membership check)
    PropertyMap.tsx           -- map view (primary screen)
    PropertyPlants.tsx        -- list / search
    Settings.tsx              -- change password / sign out
  admin/                      -- /admin/* pages (gated by LOCAL_ADMIN worker env)
    AdminLayout.tsx AdminProperties.tsx AdminPropertyForm.tsx
    AdminUsers.tsx AdminBackups.tsx AdminMap.tsx
    admin-api.ts admin-types.ts
  components/
    ui/Button.tsx
    map/                      -- MapView, BasemapToggle, visibility-mode
    plants/PlantSheet.tsx     -- add / edit / info + photo timeline
    AuthGuard.tsx PropertySwitcher.tsx PropertyTabs.tsx
  lib/
    api.ts api-map.ts         -- typed fetch wrappers for the Worker API
    auth-context.tsx use-auth.ts property-context.tsx
    h3.ts                     -- H3 utilities (h3-js wrapper)
    photos.ts                 -- canvas resize + exifr read
  index.css                   -- Tailwind entry

worker/                       -- Cloudflare Worker (API, Hono)
  index.ts                    -- route registration + origin check + 404
  routes/  auth.ts map.ts admin.ts properties.ts plants.ts photos.ts
  lib/     auth.ts crypto.ts db.ts origin-check.ts rate-limit.ts

migrations/                   -- D1 SQL migration files (0001..0007)
scripts/                      -- backup.mjs, seed-dev.mjs
test/                         -- worker/ (vitest-pool-workers) + client/ (jsdom)
docs/adr/                     -- architecture decision records
public/                       -- (PWA manifest + icons land here in E9)
```

Not yet present (planned epics): `lib/db/` Dexie cache + PWA manifest (E9),
`worker/routes/cells.ts` (E8), `worker/routes/export.ts` (E11). Zustand, Dexie,
and zod from the §8.1 stack table are not yet installed — cross-screen state
currently uses React context, and validation is hand-rolled server-side.

vite.config.ts -- includes vite-plugin-pwa, Tailwind, dev proxy to :8787
wrangler.toml -- Worker + D1 + R2 + KV bindings; excludes admin/

```

## 9. Data privacy & safety

The threat model is "small family hobby app" — not a high-value target — but the design takes the cheap, simple precautions seriously.

**Identity & access**

- Authorization checked in every API handler: users only see active (non-archived) properties they're members of
- Admin operations (create / edit / archive properties, manage users) live behind the `LOCAL_ADMIN` gate and return 404 in production, so they have **no working endpoint** on the deployed Worker. A leaked site password gives an attacker a useless empty account, not a way in.
- Spatial-first lookup is bounded by admin-controlled property creation, so it cannot be weaponized to surface other users' data
- Passwords hashed with PBKDF2-SHA256 (Web Crypto, 600k iterations, per-user salt); minimum 10 characters
- Generic "invalid email or password" errors prevent account enumeration; constant-time hash comparison even when the user doesn't exist

**Sessions & cookies**

- JWT in `HttpOnly`, `Secure`, `SameSite=Strict` cookie, 30-day sliding expiry
- All state-changing endpoints additionally check the `Origin` header
- No JWT revocation in v1 (acceptable for a hobby app; if a session is compromised, change the password and wait for the JWT to expire — or rotate `JWT_SECRET` to invalidate everything)

**Brute-force protection**

- KV-backed rate limiter on `/auth/login` (per email + per IP) and `/auth/register` (per IP) — see §8.7

**Secrets**

- Site password and JWT secret stored only as Cloudflare Worker secrets, never in the repo
- The Cloudflare API token used by the admin tool lives only on the admin's laptop, never deployed
- Password-reset tokens are random, single-use, expire after 24h, and stored as `sha256(token)` so a DB read leak does not yield working links

**Photos**

- EXIF (including original GPS) stripped client-side during canvas resize — original metadata never leaves the device
- R2 bucket is private; photos served via the auth-checked `GET /photos/:id` Worker endpoint, never with a public R2 URL

**URL obfuscation**

- The deployed app lives at a non-discoverable URL (long random `*.pages.dev` subdomain); not a primary control, but reduces drive-by traffic

**Backups & export**

- The admin tool's backup command dumps D1 → SQLite file and pulls all R2 photos to a local folder; run regularly and before risky operations
- Per-user export: download all plants, photos, and metadata as a ZIP

## 10. Cost estimate

For one user with one or two small properties (Stack: Cloudflare Pages + Workers + D1 + R2):

| Component            | Free tier                                | Expected usage                         | Cost     |
| -------------------- | ---------------------------------------- | -------------------------------------- | -------- |
| Cloudflare Pages     | Unlimited static requests, 500 builds/mo | A few deploys per week                 | **€0**   |
| Cloudflare Workers   | 100k requests/day                        | Tens to low hundreds per day           | **€0**   |
| Cloudflare D1        | 5 GB DB, 5M row reads/day                | <50 MB, low thousands of reads         | **€0**   |
| Cloudflare R2        | 10 GB storage, free egress               | 1.5 GB y1 → ~5 GB y5                   | **€0**   |
| Map tiles (MML WMTS) | Free for non-commercial                  | A few thousand tiles, mostly cached    | **€0**   |
| Email                | None — invites shared manually           | n/a                                    | **€0**   |
| Domain               | Optional                                 | ~€10/year if a custom domain is wanted | optional |

**Total: €0/month** for personal use, with no platform-pause risk and no email-sending dependency.

## 11. Roadmap

### MVP (v1.0)

- Site-password self-registration + email/password login (no email infrastructure)
- KV-backed rate limits on login and registration
- Admin pages (SPA `/admin/*`) for property creation/editing/archiving and user/member management, gated by `LOCAL_ADMIN` (endpoints 404 in production)
- Spatial-first lookup: data at hex cells of an archived property resurfaces when the admin creates a new property over the same hexes
- Local backup of D1 + R2 from the admin tool
- Map with satellite imagery and H3 grid overlay (3 visibility modes: Off / Occupied only / Full)
- Add / edit / delete plants in cells
- Photo upload (resized only), attachable to plant or cell
- Cell-level notes and photos (hex-specific, separate from plant notes/photos)
- Photo timeline per plant
- List view and search
- Mobile-first PWA, installable
- Site-password self-registration + email/password login (no email infrastructure)
- Family access via admin-assigned membership (full edit rights; no email invites)
- Offline read

### v1.1

- Offline write queue with sync
- Custom zone names (rename parent hex regions)
- Photo side-by-side comparison
- Export to GeoJSON / CSV / ZIP

### v1.2

- Plant care reminders (water, fertilize, prune)
- Phenology notes (leaf-out, flowering, fruiting dates)
- Latin-name autocomplete from a plant-name database

### Possible future

- Public read-only share link per property
- Edit history view
- Tags and custom fields per plant

## 12. Decisions log

Resolved during PRD review:

- **Hex grid visibility** — three preset modes: Off / Occupied only / Full (with occupied cells coloured distinctly in Full mode). See §5.
- **Property boundary** — required. Created and edited from a dedicated admin / configuration page using polygon drawing and/or hex picking. See §6.1.
- **Property deletion** — soft delete only in MVP. Plants / cells / photos are preserved and resurface under any new property covering the same hexes (spatial-first lookup). See §6.1.
- **Cell notes & photos** — included in MVP. Hexes can carry their own notes/photos independently of any plant. See §6.6, §6.7.
- **Photo storage** — only the resized 2048 px version is kept; originals are discarded after client-side resize. See §6.7.
- **Latin-name autocomplete** — deferred to v1.2 (plant-name database integration). MVP uses free text. See §11.
- **Map tiles** — MML WMTS only (Finland-only use case). Mapbox dropped. See §8.5.
- **Stack** — Vite SPA + Cloudflare Pages + Workers + D1 + R2 + KV. Free, no platform-pause, fully runnable locally with `wrangler dev`. See §8.
- **Authentication** — single shared site password gates self-registration; email + password login afterwards; no email infrastructure. See §8.7.
- **Admin model** — property and user/member management is admin-only, implemented as SPA `/admin/*` pages calling Worker endpoints gated by `LOCAL_ADMIN`; those endpoints 404 in production. (Superseded the original standalone-tool-via-Cloudflare-HTTP-API design.) See §8.9.
- **Rate limiting** — KV-backed per-email and per-IP limits on login and registration. See §8.7.
- **Photo serving** — private R2 bucket, served through an auth-checked Worker endpoint. See §8.7, §9.
- **Photo storage** — photos live in R2, **not** as base64/BLOB in D1: the free D1 database caps at 500 MB (vs R2's 10 GB free + free egress), and base64 adds a ~33% size tax. See ADR-0002 and `claudedocs/infra-cost-review.md`.
- **JWT revocation** — explicitly out of scope for v1; acceptable for a hobby app. Sessions expire after 30 days; password change does not invalidate older sessions. See §9.
- **URL obfuscation** — deployed to a long random `*.pages.dev` subdomain as a defense-in-depth measure (not a primary control). See §8.8.

## 13. Glossary

- **H3**: Uber's open-source hexagonal hierarchical geospatial indexing system
- **Resolution (res)**: H3's granularity level, 0 (huge) to 15 (tiny). Each level has 7× more cells than the previous.
- **Cell / hex**: A single hexagonal area at a given resolution
- **Parent / child**: H3 cells nest hierarchically; a res 14 cell is the parent of 7 res 15 cells
- **PWA**: Progressive Web App — a website that installs and behaves like a native app
- **SPA**: Single-Page Application — one HTML shell + JS bundle, all routing client-side
- **WMTS**: Web Map Tile Service, the standard for serving map tiles
- **MML**: Maanmittauslaitos, the Finnish national land survey agency
- **D1**: Cloudflare's managed SQLite database, exposed via the Workers runtime
- **R2**: Cloudflare's S3-compatible object storage with no egress fees
- **Worker**: A serverless function on Cloudflare's edge runtime (V8 isolates), used here as the API
- **Wrangler**: The Cloudflare CLI for running Workers locally (`wrangler dev`) and deploying (`wrangler deploy`)
- **JWT**: JSON Web Token, a signed and base64-encoded payload used here for stateless session cookies
- **PBKDF2**: A password-hashing function provided by the Web Crypto API; used here with SHA-256 and 600k iterations
```
