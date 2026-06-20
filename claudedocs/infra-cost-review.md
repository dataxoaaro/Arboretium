# Infrastructure & cost review

_June 2026. Figures from Cloudflare's pricing/limits docs (links at the end);
free tiers change, so treat the headline numbers as "checked June 2026."_

## TL;DR

Hosting this app on Cloudflare's free tier costs **€0/month** and stays there
for the realistic lifetime of a ≤10-user family arboretum. Every service is
1–3 orders of magnitude under its free ceiling. The only optional spend is a
custom domain (~€10/year). **Keep photos in R2; do not store them as base64 in
D1** (see the dedicated section — it's the cheap-looking idea that actually
costs the most).

## The stack and what each piece costs

| Service         | What it does here     | Free tier (June 2026)                                                                           | Our expected use                | Cost            |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------- | --------------- |
| **Pages**       | Serves the SPA bundle | Unlimited static requests, 500 builds/mo                                                        | A few deploys/week              | €0              |
| **Workers**     | The Hono API          | 100,000 requests/day, 10 ms CPU/request                                                         | Tens–hundreds of req/day        | €0              |
| **D1** (SQLite) | All relational data   | 5 GB account storage, **500 MB per database (free)**, 5 M rows read/day, 100 k rows written/day | <10 MB, low-thousands reads/day | €0              |
| **R2**          | Resized photos        | 10 GB storage, 1 M writes/mo, 10 M reads/mo, **egress free**                                    | <2 GB for years                 | €0              |
| **KV**          | Rate-limit counters   | 100 k reads/day, 1 k writes/day, 1 GB                                                           | A few writes/day                | €0              |
| **Domain**      | URL                   | `*.pages.dev` subdomain free                                                                    | Optional custom domain          | €0 (or ~€10/yr) |

**Where the ceilings actually are.** Nothing here is close. The first limit
we'd ever approach is **R2 storage (10 GB)** — at ~400 KB per resized 2048 px
photo that's roughly **25,000 photos** before paying anything, and overage is
only **$0.015/GB-month** with **free egress**. A family documenting a cottage
arboretum will not get near it.

## "What if we put all the images in SQLite as base64?"

Short answer: **don't.** It looks cheaper (one store, no R2) but it's the most
expensive option on the metric that matters here — the free-tier ceiling — and
it's slower.

The hard numbers:

- **A free D1 database is capped at 500 MB** (10 GB only on the paid plan). R2's
  free tier is **10 GB** — 20× more headroom, for the same €0.
- **Base64 inflates every image by ~33%.** A 400 KB photo becomes ~540 KB of
  text. 500 MB ÷ 540 KB ≈ **~900 photos** before the database is full — and that
  space is shared with all the plant/cell/user rows.
- **When D1 is full you can't write _anything_** — no new plants, notes, users,
  or `ALTER`/`CREATE`. Filling the DB with photos takes the whole app down for
  writes, not just photos.
- **Per-value cap is 2 MB**, so any larger/original image can't be a single
  value at all; resized photos fit but there's no headroom.
- **Reads get heavier.** `SELECT *` on a plant's photo timeline pulls base64
  blobs into the Worker and across the wire; payloads balloon and the 100 KB SQL
  statement limit and query latency start to bite. R2 streams bytes straight to
  the browser instead.
- **Backups bloat.** `wrangler d1 export` of a base64-stuffed DB is a giant SQL
  file. Today's backup already captures everything cheaply (D1 dump + a copy of
  the R2 folder).

If single-file portability is the goal, we already have it: `pnpm admin:backup`
produces one folder containing the D1 dump **and** the R2 photos. And if we ever
truly wanted images in a database, we'd use a native **BLOB** column (no 33%
base64 tax) — but D1 still isn't a blob store, so R2 remains the right call.

Recorded as **ADR-0002**.

## Could anything be cheaper than Cloudflare?

Not meaningfully — €0 with no cold starts and free egress is the floor.

- **Single small VPS** (e.g. Hetzner CX22, ~€4/mo): the SPA + a tiny server +
  SQLite + photos on the filesystem. Conceptually the simplest "one box," but
  it's ~€4/mo (not €0) and you own TLS, backups, patching, and uptime.
- **Fly.io / Render free tiers:** machines sleep / cold-start — poor for a
  family app you open occasionally in the garden.
- **Other static hosts** (Netlify/Vercel free) still need the Worker + D1 + R2
  somewhere; Cloudflare keeps it one provider with the best free limits.

**Recommendation:** stay on Cloudflare's free tier. Revisit only if photo
storage ever crosses ~8 GB (raise the R2 budget — pennies) or the app outgrows
"small family tool," which is out of scope.

## Sources

- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
