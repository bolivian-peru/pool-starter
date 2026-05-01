# CLAUDE.md — pool-starter

> Reading this means you're an AI agent (Claude Code, Cursor, etc.) helping a human build on top of the Proxies.sx Pool Gateway. This file tells you everything you need to know without having to read source. Treat it as authoritative.

## What this project is

`pool-starter` is the open-source toolkit for **reselling the Proxies.sx Pool Gateway** under your own brand. Three deliverables:

1. **`@proxies-sx/pool-sdk`** — Typed TS/JS client for the reseller API. Mint/list/update Pool Access Keys (`pak_*`), build proxy URLs with the username-token DSL, fetch live stock. Foundation.
2. **`@proxies-sx/pool-portal-react`** — Drop-in React `<PoolPortal />` + headless hooks + `createPoolApiHandlers()` Next.js route factory. Host auth, trust boundary on the server.
3. **`create-pool-portal`** — CLI scaffold for a full Next.js reseller app with auth, Stripe, dashboard. (Phase 2 — not yet built.)

## The product this depends on

Upstream service: **Proxies.sx Pool Gateway** at `gw.proxies.sx:7000` (HTTP) and `:7001` (SOCKS5). Real mobile + residential proxies in 6 countries (DE, PL, US, FR, ES, GB). Wholesale pricing has volume tiers — live rates in `client.proxies.sx` dashboard. Don't hardcode prices anywhere.

Reseller API: `https://api.proxies.sx/v1/reseller/pool-keys`. Auth with an API key (`psx_*`) minted at `client.proxies.sx/account` with scope `customers:write`.

## How auth works between the layers

```
Customer's HTTP client
      │ proxy string (contains pak_customer_key)
      ▼
gw.proxies.sx:7000   ← Customer's traffic goes here DIRECTLY
(Proxies.sx gateway)

Customer's browser
      │ (normal web session)
      ▼
Reseller's deployed app (yourdomain.com)
      │ uses @proxies-sx/pool-sdk with psx_ reseller API key
      ▼
api.proxies.sx/v1/reseller/pool-keys   ← Customer NEVER touches this
```

The `pak_` key is the *customer's* credential. The `psx_` API key is the *reseller's* credential and MUST stay server-side.

## Repo layout

```
pool-starter/
├── packages/
│   ├── sdk/              # @proxies-sx/pool-sdk            ✅ built
│   └── react/            # @proxies-sx/pool-portal-react   ✅ built
├── apps/                 # reserved for create-pool-portal template
├── package.json          # workspace root
├── pnpm-workspace.yaml
├── CLAUDE.md             # this file
└── LICENSE               # MIT
```

### packages/react tasks

- **Add a new prop to `<PoolPortal>`** → edit `packages/react/src/PoolPortal.tsx`, extend `PoolPortalProps`, update README props table.
- **Add a new hook** → write in `packages/react/src/hooks.ts`, export from `src/index.ts`.
- **Add a new server handler** → edit `packages/react/src/server.ts`; keep path-based dispatch simple.
- **Restyle component without forking it** → users pass `classNames` prop or import/override the CSS custom properties from `styles.css`.

## What's new in SDK 0.3.x (read before writing code)

The SDK matured from 0.2.0 (stable surface, no retry, type-loose) to
0.3.1 (production-ready). When generating example code or migrations,
default to these patterns:

- **Retry on by default.** `new ProxiesClient({ retry: { attempts, baseDelayMs, maxDelayMs } })` — fires on 5xx/429/timeouts/network with full jitter, honors `Retry-After`. Skips 4xx (except 429). Pass `retry: false` to disable. **Never** wrap your own retry around SDK calls — it causes thundering herd.
- **Idempotency-Key on writes.** `create({ ..., idempotencyKey })`, `topUp(id, { ..., idempotencyKey })`, `regenerate(id, { idempotencyKey })`. Tie the key to a domain object (Stripe event id, ledger id, invoice id) — never `randomUUID()` inline at retry time. Platform dedupes within 24h.
- **Top-up via `poolKeys.topUp()`** (not `update()`). Server-side atomic single-write: `addTrafficGB` is `$inc`-d, `extendDays` extends from `max(now, current_expiresAt)` (never shortens). Replaces the read-modify-write race.
- **`poolKeys.get(id)`** for single-record fetch. Don't `list()` + filter on a known id.
- **`ProxiesApiError.requestId`** is populated from the `X-Request-ID` response header. Log it on every error path; paste in support tickets to skip log-grepping.
- **`PoolStock` shape** (fixed in 0.3.1): `{ pools: { mbl, peer }, totals, generatedAt }`. The 0.2.x type `{ countries: [...] }` never matched the live API. Runtime validator throws `ProxiesError` if upstream drifts again.
- **`Country`** is now `KnownCountry | (string & {})` — string-assignable so future-supported countries don't require an SDK bump, but `KnownCountry` keeps autocomplete for the curated list.

For migration of existing 0.2.0 integrations, see [`docs/MIGRATION-0.3.0.md`](./docs/MIGRATION-0.3.0.md).

For webhooks (Block 2, target 0.4.0), see [`packages/sdk/docs/WEBHOOKS-DESIGN.md`](./packages/sdk/docs/WEBHOOKS-DESIGN.md).

## Common agent tasks

### Add a new country to the SDK
Edit `packages/sdk/src/types.ts` — the `KnownCountry` type union (NOT
`Country` — that's `KnownCountry | (string & {})` and is intentionally
permissive). Also update the TSDoc example in `packages/sdk/src/url.ts`. Then update `packages/sdk/README.md`.

### Bump the SDK version
Edit `packages/sdk/package.json` version field. Run `pnpm -r --filter @proxies-sx/pool-sdk build`. Publish with `pnpm publish --filter @proxies-sx/pool-sdk`.

### Add a new reseller API endpoint to the SDK
1. Add method to the relevant API class in `packages/sdk/src/client.ts`
2. Add types in `packages/sdk/src/types.ts`
3. Add TSDoc with an example
4. Add a test in `packages/sdk/test/`
5. Document in `packages/sdk/README.md`

### Change the default gateway URL (e.g. for a regional edge)
Edit `packages/sdk/src/url.ts` — the `GATEWAY_HOST` constant. This flows through to `buildProxyUrl`.

### Add a new rotation mode
Extend `RotationMode` union in `packages/sdk/src/types.ts`. Test coverage in `packages/sdk/test/url.test.ts`.

## Don't do these things

- **Never** hardcode a reseller's `psx_` API key in source, examples, or tests. Use `process.env.PROXIES_SX_API_KEY` or fixtures that are `psx_test_...` placeholders.
- **Never** expose the reseller API key to the browser bundle. The SDK is designed to run server-side. `buildProxyUrl()` is the only truly browser-safe export — even then, passing real `pak_` keys to the browser is the host app's choice, not the SDK's concern.
- **Never** log `pak_` keys in full. Truncate to `pak_...` in any log output.
- **Never** commit `.env` files. `.env.example` only.

## Development commands

```bash
# From repo root
pnpm install                              # install workspace deps
pnpm -r --filter @proxies-sx/pool-sdk build
pnpm -r --filter @proxies-sx/pool-sdk test
pnpm -r --filter @proxies-sx/pool-sdk typecheck
```

## Publishing

```bash
# Make sure you're logged into npm as a proxies-sx org member
cd packages/sdk
npm version patch             # or minor/major
pnpm build
npm publish --access public
```

## Key invariants

1. `buildProxyUrl()` output MUST be URL-encoded — username/password may contain `@`/`:` in the user's `sid` token.
2. `pak_` keys regenerated via `regenerate()` invalidate the old value **immediately** — the old pak_ stops working mid-session.
3. `trafficCapGB: null` means "unlimited within reseller's own pool." `0` would mean "blocked." Never confuse them.
4. `expiresAt: null` means "never expires." Setting a Date or ISO string in the past is rejected by the platform — use `enabled: false` to disable a key, not a past date.
5. Expired keys are rejected by the gateway **immediately** (inline check on every auth). The platform's nightly cron at 03:30 UTC just flips `enabled = false` for tidiness; revocation does not depend on it.
6. The SDK never caches responses. Callers who need caching layer it themselves (React Query, SWR, etc.).

## Common agent tasks (continued)

### Add a new field to `PoolAccessKey`
1. Update the platform schema (`gb-system-api/src/reseller/schemas/pool-access-key.schema.ts`) and serializer.
2. Mirror the field in `packages/sdk/src/types.ts` (`PoolAccessKey` interface). Add to `CreatePoolAccessKeyInput` / `UpdatePoolAccessKeyInput` if writable.
3. Bump SDK + React minor versions, document in both READMEs and `SKILL.md`, regenerate the React `MeResponse.usage` shape if exposed to the dashboard.

## License

MIT for the SDK. Apache 2.0 for the Next.js starter template (when it ships). The SDK's permissive license is intentional: we want *everyone* to build on top.
