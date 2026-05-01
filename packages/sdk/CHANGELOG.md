# Changelog — `@proxies-sx/pool-sdk`

All notable changes to this package are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
semver from 0.3.0 onwards (the public surface is everything exported from
`dist/index.d.ts`).

## 0.3.0 — Production-readiness pass

Driven by paying-reseller feedback (Coronium audit, 2026‑04‑30). Removes the
need for host-app retry wrappers and locks down the double-mint footgun on
write retries.

### Added

- **Built-in retry + exponential backoff with full jitter.** Configurable via
  `ClientConfig.retry: false | { attempts, baseDelayMs, maxDelayMs }`.
  Defaults to 3 attempts, 250ms / 1s / 4s. Fires on `5xx`, `429`, timeouts,
  and network-level errors. Honors `Retry-After` (seconds and HTTP-date).
  Skips `4xx` (except `429`).
- **`Idempotency-Key` support on writes.** Pass `idempotencyKey` on
  `poolKeys.create()`, `poolKeys.topUp()`, `poolKeys.regenerate()`. The
  platform dedupes within a 24h window — retried calls with the same key
  return the cached response instead of creating a second resource.
- **`ProxiesApiError.requestId`.** Populated from the `X-Request-ID` response
  header. Paste it in support tickets to skip log-grepping.
- **`poolKeys.topUp(keyId, { addTrafficGB?, extendDays?, idempotencyKey? })`.**
  Atomic single-write: cap `$inc`-ed server-side; expiresAt extended from
  `max(now, current_expiresAt) + days` (never shortens). Replaces the
  read-modify-write pattern over `update()`.
- **`poolKeys.get(keyId)`.** Single-record fetch. Avoids `list()` + filter
  on large fleets.
- **`KnownCountry` type** — literal union of currently-supported countries
  for IDE autocomplete. `Country` is now `KnownCountry | (string & {})` so
  forward-compatible without breaking the autocomplete experience.
- **`ProxiesApiError.isRetryable`** getter — `true` for `429`/`5xx`. Useful
  if you've disabled SDK retries.
- **`RetryConfig` exported type.**
- **`TopUpPoolAccessKeyInput` exported type.**

### Changed

- **`poolKeys.regenerate()` now returns the full `PoolAccessKey` record**
  (was: `{ id, key }`). The original two fields are still present, so
  call sites destructuring `{ id, key }` continue to work.
- **`RotationMode` JSDoc** rewritten with concrete gateway-level behavior
  for `none` / `auto10` / `auto30` / `sticky` / `hard`.

### Backwards compatibility

- Adding fields only. No removals, no renames.
- Default retry on means previously-throwing transient `5xx`/`429` calls
  now resolve after backoff. If you had your own retry wrapper, **delete
  it** — combining retries causes thundering herd.
- If your host app threw on transient errors and you depended on that
  for fast-fail, set `retry: false` in the constructor to restore the
  prior behavior.

## 0.2.0

- Added `expiresAt` on `PoolAccessKey`.
- Added `isPoolKeyExpired()` and `daysUntilPoolKeyExpiry()` helpers.
- Added `isExpired` server-computed flag on responses.
- `<PoolPortal>` (companion `@proxies-sx/pool-portal-react` 0.2.0) renders
  expiry banners.

## 0.1.0

- Initial release. Mint / list / update / regenerate / delete pool keys;
  build proxy URLs; pool stock + incident feeds.
