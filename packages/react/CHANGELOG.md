# Changelog — `@proxies-sx/pool-portal-react`

All notable changes to this package are documented here.

## 0.3.0 — Pool stock fix + SDK 0.3.1 alignment

Surfaced by Coronium's live integration audit (2026‑05‑01). The
`<StockIndicator>` inside `<PoolPortal>` was reading the old
`stock.countries.find(...)` shape that never matched the live API —
which meant **every dashboard built on this component was rendering a
blank stock indicator**.

### Fixed

- **`StockIndicator` reads the correct `stock.pools.{mbl,peer}[country]`**
  shape from `GET /v1/gateway/pool/stock`. Pre-0.3.0 it iterated
  `stock.countries` which was always `undefined`. Live numbers now
  render in dashboards.

### Changed

- **Bumped `@proxies-sx/pool-sdk` peer to `^0.3.1`** — gives consumers
  built-in retry, idempotency-key support, `topUp()`, `get()`, and
  `requestId` correlation. See the SDK CHANGELOG for the full list.
- **README example:** Stripe webhook handler now uses `poolKeys.topUp()`
  for top-ups (atomic, race-safe, idempotent) instead of the
  read-modify-write pattern over `update()`. The mint path also
  shows passing `idempotencyKey: ` `mint_${session.id}` ` for
  retry-safety.

### Migration

If you've been using `<PoolPortal showStock />` and the count was
silently rendering blank, install 0.3.0 — it just starts working.
No code changes on your end.

---

## 0.2.0

- Initial release with `expiresAt` / countdown banner support.
