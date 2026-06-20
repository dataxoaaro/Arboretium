# Photos live in R2, not as base64 (or BLOBs) in D1

Resized photos are stored as objects in Cloudflare R2 and served through the
auth-checked `GET /photos/:id` Worker route. We deliberately do **not** store
image bytes in D1 (neither base64 text nor native BLOB), even though a
single-store design looks simpler.

## Why

- **Free-tier headroom.** A free D1 database is capped at **500 MB**; R2's free
  tier is **10 GB** — 20× more room for the same €0. Base64 also inflates each
  image ~33%, so D1 would hold only ~900 photos before filling.
- **A full D1 blocks all writes.** Filling the database with images would stop
  new plants, notes, and users too — not just photos.
- **R2 is built for this:** free egress, streaming straight to the browser,
  2 MB+ objects, and it's already wired (Worker-proxied upload, private bucket,
  auth-checked serving).
- **Local-first still holds:** in `wrangler dev`, R2 is Miniflare's simulated
  bucket (a folder), so there's no external dependency in development.

## Consequences

- Photo bytes never enter D1; the `photos` table stores only metadata + the R2
  key. Backups capture both (`pnpm admin:backup` dumps D1 and copies the R2
  folder), so "one backup = everything" portability is preserved without
  paying the base64 cost.
- If a future need ever forced DB-stored blobs, use a native `BLOB` column (no
  base64 tax) — but that remains a last resort, not the default.

See `claudedocs/infra-cost-review.md` for the full numbers.
