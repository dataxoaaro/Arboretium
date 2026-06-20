# Testing strategy: real-binding worker tests, behavioral scope, map layer to E2E

We are backfilling tests to 80% across the existing seven epics and going TDD
forward. Worker tests run inside `workerd` via Vitest +
`@cloudflare/vitest-pool-workers`, so they exercise **real local D1/R2/KV**
(Miniflare) rather than mocks — because the app's stated #1 risk is data
exposure through the spatial-first H3 lookup and the photo plant-or-cell
`CHECK`, and that logic lives in SQL that mocks would hide. Frontend tests use
Vitest + React Testing Library + jsdom.

## Scope

- **Behavioral, not load.** Tests assert correctness across the happy path, auth
  failures, and bad input. This is a <10-user hobby app, so the rate limiter
  gets a single small-N behavioral test (N failures → blocked → window resets),
  not a load harness.
- **80% target is split pragmatically.** Full coverage on the worker, the
  pure-logic libs (h3 helpers, api client, EXIF/`taken_at` parsing), and
  form/flow components (login, plant sheet, list + search).
- **Deliberate no-unit-test zone: the rendering layer.** `MapView`/`AdminMap`
  (MapLibre/WebGL) and the canvas resize in `photos.ts` are NOT unit-tested in
  jsdom — WebGL/canvas mocks are brittle and assert almost nothing. They are
  covered by Playwright E2E instead, scoped into E11 (overlaps ARB-201 mobile
  QA).

## Considered options

- **Hand-mocked D1/KV/R2** — trivial setup, but mocks away the SQL/constraint/
  authz behavior that is the whole point. Rejected.
- **Literal 80% everywhere including the map layer** — maximal coverage number,
  but fragile WebGL/canvas scaffolding that breaks on MapLibre upgrades and
  tests little real behavior. Rejected.

## Consequences

- A `test` step + coverage gate must be added to CI (currently format + lint +
  typecheck + build only).
- `vitest-pool-workers` pins to specific Vitest versions; upgrades are
  coordinated, not independent.
- Coverage numbers exclude the map/canvas layer by design; do not read the
  gap as "untested" — it is tested at the E2E tier.
