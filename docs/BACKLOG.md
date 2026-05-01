# pool-starter — Roadmap & open requests

Tracking deferred features so they don't fall on the floor between
round-trips. Each entry includes the source, target version, and
acceptance criteria.

---

## Recently shipped

- **0.5.0 — Pool Access Key security hardening** (2026‑05‑01). Three
  new SDK methods (`reveal`, `audit`, `auditForKey`) tracking the
  platform's pak_ security update. Auto-suspend on cap exceeded means
  consumer auto-topup flows must explicit `update({ enabled: true })`
  after `topUp` — starter app webhook updated. `RotationMode` widened
  to include `auto5 / auto20 / auto60 / ondemand` (was missing,
  caused typecheck errors). See SDK CHANGELOG.

---

## 0.5.x — In design

### Stale explicit-sid session auto-close

**Source:** Coronium reply (2026‑05‑01) — production scrapers
crashing mid-batch leave 50+ sticky sessions warm, customer hits the
50-session-per-account cap before TTL evicts them.

**Suggested shape (Coronium):**

```
DELETE /v1/gateway/pool/my-sessions?staleMinutes=15
```

Or as a flag on the existing close-all endpoint, e.g. body
`{ staleMinutes: 15 }`. Closes any session of the current user where
`Date.now() - lastActivityAt > staleMinutes * 60 * 1000`. Should
ignore synth-sid sessions (those already auto-die in 5 min).

**SDK shape (target 0.5.0):**

```ts
// @proxies-sx/pool-sdk
client.sessions.closeStale({ olderThanMinutes: 15 }):
  Promise<{ count: number }>;
```

**React (target 0.5.0):**

`<ActiveSessionsTable>` gets a header dropdown:
"Close all… [stale (>15 min idle) / all]".

**Implementation notes:**
- Gateway-side: filter on `lastActivityAt` from session store, then
  reuse the existing per-key delete flow.
- Should NOT fire on synth-sid sessions (5-min TTL handles them).
- Audit event: `sessions.closed_stale` with `count` + `cutoffMinutes`.

**Status:** Design pending.

---

## 0.5.x — Block 2 (Webhooks)

`pak.*` events extending the existing `reseller-webhook` infrastructure.
Full design at [`packages/sdk/docs/WEBHOOKS-DESIGN.md`](../packages/sdk/docs/WEBHOOKS-DESIGN.md).

**Source:** Coronium 2026‑04‑30 audit (Block 2 from the original
production-readiness pass).

**Status:** Design done, implementation deferred until 0.3.1+0.4.0
have soaked at Coronium for 2-4 weeks. Re-evaluate around 2026‑05‑20.

---

## 0.6.x — Block 3 (Bulk + tenant + history)

From the same 2026‑04‑30 audit:

- `client.poolKeys.bulkUpdate(ids, patch)`
- `client.poolKeys.usageHistory(keyId, { from, to, granularity })` — needs daily snapshot rollup table on the platform
- `ClientConfig.tenant` header for sub-reseller audit trails
- `client.poolKeys.archive(keyId)` (soft-delete with audit retention)

**Status:** Pending until Coronium hits 5K+ active keys (target Q3 2026).

---

## Optional / will-do-when-asked

| Item | Source | Notes |
|---|---|---|
| `<PoolPortalAdvanced>` wrapper | Coronium 0.4.0 reply | Compose `<PoolPortal> + <PoolSessionSpawner> + <ActiveSessionsTable>` in one block. Skipped in 0.4.0 — revisit when 2+ resellers ask. |
| Cache TTL transparency in admin UI | Coronium 0.3.1 audit | Admin banner showing "auth cache: 30s valid / 10s invalid" so resellers know what to expect after flag changes. Trivial. |
| Stable error `code` field in API responses | Coronium 0.3.1 audit (Bug 5) | Currently `requestId` is the only structured field; `code` would let receivers branch programmatically. |
| Path namespace docs | Coronium 0.3.1 audit (Bug 4) | Add a "Routes" section to packages/sdk/README.md that maps every SDK method → API path. |
| HMAC request signing | 2026‑04‑30 audit (Block 4) | Optional, not needed until a paying reseller asks. |
| Public OpenAPI for reseller surface | 2026‑04‑30 audit | Today only Swagger UI behind basic auth. Useful when first non-Coronium reseller signs up. |

---

## Done — for cross-reference

| Round-trip | Items | Date |
|---|---|---|
| 0.2.0 → 0.3.0 | Built-in retry, idempotency, requestId, `topUp()`, `get()` | 2026-05-01 |
| 0.3.0 → 0.3.1 | `PoolStock` type fix + runtime validator, KnownCountry widened | 2026-05-01 |
| 0.3.1 → 0.4.0 | Sessions API + `<PoolSessionSpawner>` + `<ActiveSessionsTable>` + 5-min synth TTL + `gw:` prefix DELETE bug | 2026-05-01 |
| Partnership flag | Coronium `poolFreeBandwidth: true` | 2026-05-01 13:08 UTC |
| Gateway diagnostics | X-Request-ID in 407 body + structured E_* codes + bonus pak_ fallback message clarity | 2026-05-01 |

Three round-trips in one day. Cadence to maintain.
