# Staying inside the free tier (cost guardrails)

R2 now has a card on file, so overages would be billed. Cloudflare has **no
hard spend cap**, so protection is two layers: an **app-enforced storage budget**
(deterministic) and a **billing notification** (backstop). For a ≤10-user family
app, every limit below is otherwise 1–3 orders of magnitude away.

## The one that can actually grow: R2 storage

- **Limit:** 10 GB free; overage $0.015/GB-month.
- **Guardrail (in code):** every photo's byte size is stored in D1; the upload
  route sums it and **refuses uploads (HTTP 507) once the total would cross
  `MAX_PHOTO_BYTES`** (default **9 GB**, set in `wrangler.toml [vars]`). So
  storage can't run past the free tier — uploads just stop with "Photo storage
  is full. Delete some photos to free space." Lower `MAX_PHOTO_BYTES` to be
  stricter. Tested in `test/worker/photos.test.ts`.
- Photos are also resized client-side to ≤2048 px (~300–500 KB) and hard-capped
  at 10 MB per upload, so 9 GB is ~20,000+ photos.

## The rest — naturally bounded, no overage realistic

| Service      | Free / month                                           | Why we won't hit it                                |
| ------------ | ------------------------------------------------------ | -------------------------------------------------- |
| R2 ops       | 1 M write, 10 M read                                   | A few uploads/day; photo reads are SW-cached       |
| Workers      | 100 k req/**day**                                      | Tens–hundreds/day for a family                     |
| D1           | 5 GB acct / 500 MB-db, 5 M reads/day, 100 k writes/day | Text-only rows (photos live in R2); stays a few MB |
| KV           | 100 k read, 1 k write/**day**                          | Only auth rate-limit counters — a few/day          |
| Pages/assets | unlimited static requests                              | Served as static assets, not billed Worker reqs    |

## Backstop: turn on a billing notification (5 min, one-time)

Cloudflare can't auto-stop at the free tier, so add an alert:

1. Dashboard → **Manage Account → Notifications → Add**.
2. Add a **Billing / usage** notification (e.g. R2 storage, or any spend > $0)
   to your email. This warns you long before the 9 GB app cap is ever reached.

## If you want zero billing risk, period

R2 is the only service with a card attached. If you'd rather not have any
overage exposure at all, lower `MAX_PHOTO_BYTES` (e.g. to 2–3 GB) — uploads stop
well inside free, and nothing else here can incur charges at this scale.
