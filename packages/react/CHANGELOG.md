# Changelog — `@proxies-sx/pool-portal-react`

All notable changes to this package are documented here.

## 0.4.0 — Multi-port spawner + active-sessions table

Coronium-driven UX parity with `client.proxies.sx/pool-proxy`.
Resellers shipping `<PoolPortal>` can now drop in two new components
and ship the same multi-port-generation + live-session-management
experience without writing it from scratch (~600 LOC saved per
integration).

### Added

- **`<PoolSessionSpawner>`** — count slider (1–100), country / pool /
  protocol / rotation / sid-mode controls, "Generate" → N proxy URLs,
  per-row Copy + bulk Copy-all + Download .txt actions.
- **`<ActiveSessionsTable>`** — live polling of the user's sessions
  with country, sid, IP, rotation, TTL countdown, byte counts, request
  count, per-row Copy URL + Close, header Close-all action. Hides
  synthesized-sid sessions by default.
- **`buildProxyString(opts)`** — exported helper used by the spawner;
  also useful from your own code.
- **Server-side handlers** — `createPoolApiHandlers()` now exposes:
  - `GET <route>/my-sessions` — list current user's sessions
  - `DELETE <route>/my-sessions/<key>` — close one (ownership-checked)
  - `DELETE <route>/my-sessions` — close all
- **Audit events** — `session.closed`, `sessions.closed_all` callbacks
  on `onAudit`.

### Changed

- **Bumped `@proxies-sx/pool-sdk` peer to `^0.4.0`** — gives consumers
  the new `client.sessions` namespace and the `ActiveSession` type
  (which includes `proxyUrl`/`socks5Url` template fields the new
  components consume).

### Backwards compatibility

Additive only. `<PoolPortal>` unchanged. Existing hooks unchanged.
Existing `createPoolApiHandlers` GET/POST routes unchanged.

---

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
