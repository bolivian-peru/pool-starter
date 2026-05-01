/**
 * Countries that the Proxies.sx Pool Gateway routes to.
 *
 * @remarks
 * `KnownCountry` is the literal union of countries online today (2026). It
 * gives autocomplete in IDEs without locking the public API to today's
 * pool composition. Use it as a hint, not as a contract — the field type
 * on `BuildProxyUrlOpts.country` is `Country` (broader) for forward
 * compatibility when new countries come online.
 *
 * For the live list, call {@link ProxiesClient.pool.getStock}.
 */
export type KnownCountry =
  | 'us' | 'de' | 'pl' | 'fr' | 'es' | 'gb'
  // Additional codes seen in live `getStock()` snapshots (peer pool):
  | 'ch' | 'pa' | 'am';

/**
 * ISO 2-letter country code. Lowercase. Validated server-side against the
 * live pool inventory — passing a country with no online endpoints will
 * return `502` from the gateway with a message listing available alternatives.
 *
 * Prefer `KnownCountry` (the literal union) where you want IDE autocomplete.
 */
export type Country = KnownCountry | (string & {});

/**
 * IP rotation strategy encoded in the proxy username.
 *
 * Behavior at the gateway level:
 *
 * - `none` — Default. The gateway picks an endpoint per session and
 *   reuses it for the session's TTL (1h default). Different connections
 *   from the same `pak_` may land on different endpoints, but a single
 *   long-lived connection stays on one IP.
 * - `auto10` / `auto30` — Same as `none` but the session expires (and a
 *   new endpoint is picked) every 10 / 30 minutes. Suitable for
 *   long-running scrapers that want periodic rotation.
 * - `sticky` — Pin to the same endpoint for the session's lifetime
 *   regardless of the auto-interval. Combine with `sid` to keep a
 *   workflow on one IP across reconnects.
 * - `hard` — On every new connection, force the gateway to pick a
 *   *different* endpoint than last time. Useful when the previous IP
 *   got blocked. Burns through endpoints faster — use sparingly.
 */
export type RotationMode = 'none' | 'auto10' | 'auto30' | 'sticky' | 'hard';

/** Pool the customer's traffic will route through. `mbl` = ProxySmart mobile modems. `peer` = residential Android peers. */
export type Pool = 'mbl' | 'peer';

/** Network protocol for the proxy URL. HTTP port 7000, SOCKS5 port 7001. */
export type Protocol = 'http' | 'socks5';

/** Pool Access Key (`pak_*`) — one per customer or campaign. */
export interface PoolAccessKey {
  /** MongoDB ObjectId of the key record. */
  id: string;
  /** The secret key itself, `pak_{24 hex}`. Treat as credential material. */
  key: string;
  /** Human-friendly label shown in your admin (e.g. `"customer:alice@acme.com"`). */
  label: string;
  /** `false` disables the key immediately; `true` re-enables. */
  enabled: boolean;
  /**
   * Maximum GB this key can consume. `null` = unbounded within the reseller's
   * own shared traffic pool.
   */
  trafficCapGB: number | null;
  /** Bytes consumed so far, in megabytes (fractional). */
  trafficUsedMB: number;
  /** Same value as {@link trafficUsedMB} but expressed in GB for display. */
  trafficUsedGB?: number;
  /**
   * Optional ISO datetime when this key stops working. After this moment,
   * gateway requests are rejected and the platform's nightly cron flips
   * `enabled` to `false`. `null` = no expiry.
   *
   * Common pattern: ship a "60-day" credit by setting this to
   * `new Date(Date.now() + 60*86400_000).toISOString()` on mint, then
   * extending it on each top-up via `update({ expiresAt })` or — preferred —
   * {@link PoolKeysApi.topUp}.
   */
  expiresAt: string | null;
  /**
   * Convenience flag computed server-side: `true` if `expiresAt` is in
   * the past. Use this in dashboards before the nightly cron has run.
   */
  isExpired?: boolean;
  /** ISO timestamp of the last request seen through the gateway, or null. */
  lastUsedAt: string | null;
  /** Unix ms when the key was first minted. */
  createdAt: number;
  /** Unix ms when the key was last modified. */
  updatedAt?: number;
}

/** Input to {@link PoolKeysApi.create}. */
export interface CreatePoolAccessKeyInput {
  /** Human label. Must be non-empty. Shown in your admin; never sent to the gateway. */
  label: string;
  /** Traffic cap in GB. Pass `null` for unbounded. */
  trafficCapGB?: number | null;
  /**
   * Optional expiry. Accepts ISO 8601 string or `Date`. The platform validates
   * it must be in the future (use `enabled: false` to disable a key, or
   * `null` to remove an existing expiry on update).
   */
  expiresAt?: string | Date | null;
  /**
   * Idempotency key (UUIDv4 recommended). When set, the platform dedupes
   * retries within a 24h window: the first call mints a key and records
   * the response; subsequent calls with the same `idempotencyKey` return
   * the cached response without minting a second key.
   *
   * Critical for webhook handlers and payment flows where a 504/network
   * blip would otherwise cause double-mints. If omitted, the SDK auto-
   * generates one (recommended) — but pass your own when you want it tied
   * to a domain object (e.g. your `payment_intent_id`).
   *
   * @since 0.3.0
   */
  idempotencyKey?: string;
}

/** Input to {@link PoolKeysApi.update}. */
export interface UpdatePoolAccessKeyInput {
  label?: string;
  enabled?: boolean;
  trafficCapGB?: number | null;
  /**
   * Pass an ISO/Date in the future to set or extend, `null` to remove an
   * existing expiry, or omit to leave unchanged.
   *
   * For top-ups (extending an existing credit), prefer {@link PoolKeysApi.topUp}
   * — it's a single atomic write and protects against read-modify-write
   * races when concurrent top-ups land on the same key.
   */
  expiresAt?: string | Date | null;
}

/**
 * Input to {@link PoolKeysApi.topUp}. All fields optional but at least
 * one of `addTrafficGB` / `extendDays` should be set.
 *
 * @since 0.3.0
 */
export interface TopUpPoolAccessKeyInput {
  /**
   * Additional GB to add to `trafficCapGB`. The cap is incremented
   * atomically server-side. If the existing cap is `null` (unbounded),
   * the cap stays `null` — passing this on an unbounded key is a no-op.
   */
  addTrafficGB?: number;
  /**
   * Days to extend the expiry. The new `expiresAt` is computed server-side
   * as `max(now, current_expiresAt) + extendDays` — so a top-up always
   * extends from the *later* of "now" and the existing expiry, never
   * shortens. If the key has no expiry, this sets one to `now + extendDays`.
   */
  extendDays?: number;
  /**
   * Idempotency key (UUIDv4 recommended). Same semantics as
   * {@link CreatePoolAccessKeyInput.idempotencyKey} — protects against
   * double-credits if the request is retried after a 504.
   *
   * Tie this to your top-up's domain ID (e.g. `topup_${invoiceId}`) for
   * effortless deduplication across retries.
   */
  idempotencyKey?: string;
}

/** Optional tokens appended to the proxy username. All fields are optional. */
export interface BuildProxyUrlOpts {
  /** ISO country code. If omitted, any country in the pool is eligible. */
  country?: Country;
  /** Carrier name (e.g. `"att"`, `"tmobile"`). Must be supported for the country. */
  carrier?: string;
  /** City name (e.g. `"nyc"`, `"berlin"`). Carrier-level precision recommended over city. */
  city?: string;
  /** Session ID — same sid → same endpoint (with `rotation: 'sticky'`). Keep stable per workflow. */
  sid?: string;
  /** Rotation policy. See {@link RotationMode}. */
  rotation?: RotationMode;
  /** Target pool. Defaults to `"mbl"`. */
  pool?: Pool;
  /** Transport. Defaults to `"http"` (port 7000). */
  protocol?: Protocol;
  /** Override the gateway host, for edge deployments or tests. */
  host?: string;
}

/**
 * Response from `GET /v1/gateway/pool/stock` (public-readable, optional auth).
 *
 * Shape verified against production 2026‑05‑01:
 *
 * ```json
 * {
 *   "pools": {
 *     "mbl":  { "us": 73, "de": 19, "fr": 18, "es": 25, "gb": 22, ... },
 *     "peer": { "us": 0,  "ch": 1, ... }
 *   },
 *   "totals":     { "mbl": 159, "peer": 1, "all": 160 },
 *   "generatedAt": "2026-05-01T09:34:32.449Z"
 * }
 * ```
 *
 * **Country codes are dynamic.** Don't switch on a literal union — new
 * countries appear in this response without an SDK release. The SDK
 * runtime-validates that the envelope keys exist (`pools`, `totals`,
 * `generatedAt`) and throws a typed `ProxiesError` if upstream changes
 * the shape, but the per-country values are pass-through.
 *
 * @since 0.3.1 — earlier SDK versions declared `{ updatedAt, countries[] }`
 *   which never matched the running server. Fixed in 0.3.1 to mirror the
 *   live response.
 */
export interface PoolStock {
  /** Per-pool, per-country online endpoint count. Country code → online. */
  pools: {
    mbl: Record<string, number>;
    peer: Record<string, number>;
  };
  /** Aggregate totals across all countries. */
  totals: {
    mbl: number;
    peer: number;
    /** Sum of `mbl` + `peer`. */
    all: number;
  };
  /** ISO 8601 timestamp when the snapshot was taken (cached server-side ~30s). */
  generatedAt: string;
}

/**
 * One live gateway session for a customer. Returned by `client.sessions.list()`.
 *
 * @since 0.4.0
 */
export interface ActiveSession {
  /** Internal Redis key — used as the id when calling `sessions.close()`. */
  sessionKey: string;
  /** The accountId (proxyUsername) the session belongs to. */
  accountId: string;
  /**
   * The session id from the customer's `-sid-` token, or a synthesized
   * `auto_*` / `socks5_*` id for sessions created without an explicit sid.
   * Synthesized sessions get a 5-min TTL and are not meant to be reused.
   * Use `isSynthesizedSid` to filter them out of customer-facing UIs.
   */
  sessionId: string;
  /** Pool the session is routed through. `mbl` = ProxySmart mobile modems, `peer` = residential. */
  pool: Pool;
  /** ISO country code (lowercase). */
  country: string;
  /** Carrier name if known, `'N/A'` otherwise. */
  carrier: string;
  /** Last observed exit IP (updates as rotation fires). */
  currentIp: string;
  /** Unix ms when the session was first opened. */
  createdAt: number;
  /** Unix ms of the last observed activity. */
  lastActivityAt: number;
  /** Unix ms after which Redis evicts the session automatically. */
  expiresAt: number;
  /** Total requests proxied through this session so far. */
  requestCount: number;
  /** Total bytes received from the upstream. */
  bytesIn: number;
  /** Total bytes sent to the upstream. */
  bytesOut: number;
  /** Endpoint id this session is currently bound to. */
  endpointId: string;
  /** Rotation token from the username DSL. */
  rotation: RotationMode | string;
  /** Seconds until automatic eviction. Counts down each call. */
  ttl: number;
  /**
   * Customer-facing HTTP proxy URL with a `<PASSWORD>` placeholder.
   * Substitute with the user's `pak_` or `proxyPassword` client-side
   * before exposing or copying. Never write the substituted value to
   * server logs.
   */
  proxyUrl: string;
  /** Same shape as `proxyUrl` but `socks5://` and port 7001. */
  socks5Url: string;
  /**
   * `true` when the session id is synthesized (no `-sid-` was supplied).
   * Filter these out of customer-facing tables — they're internal and
   * have a short 5-min TTL.
   */
  isSynthesizedSid: boolean;
}

/** Response from `client.sessions.list()`. */
export interface ActiveSessionsResponse {
  sessions: ActiveSession[];
  count: number;
}

/** Incident notice (unauthenticated public endpoint). */
export interface Incident {
  id: string;
  severity: 'info' | 'minor' | 'major' | 'critical';
  title: string;
  description?: string;
  startedAt: string;
  resolvedAt?: string;
  affects: string[];
}

/**
 * Retry behavior for transient failures.
 *
 * Retries fire on `5xx` and `429` responses, on `ProxiesTimeoutError`,
 * and on network-level errors (`fetch` rejection). They do NOT fire on
 * `4xx` (other than `429`) — those are programmer errors. Each attempt
 * waits `min(maxDelayMs, baseDelayMs * 2^n)` plus full-jitter, unless the
 * server returned `Retry-After` (in which case the SDK honors that, capped
 * at `maxDelayMs`).
 *
 * @since 0.3.0
 */
export interface RetryConfig {
  /** Total attempts including the first. Default 3. Set to 1 to disable retries. */
  attempts?: number;
  /** Initial backoff in ms. Default 250. */
  baseDelayMs?: number;
  /** Cap on per-attempt sleep. Default 4000. */
  maxDelayMs?: number;
}

/** Constructor config for {@link ProxiesClient}. */
export interface ClientConfig {
  /**
   * Reseller API key (`psx_...`) — mint at
   * https://client.proxies.sx/account with scope `customers:write`.
   * Keep this server-side only; never expose to browsers.
   */
  apiKey: string;

  /**
   * Your reseller `proxyUsername` (e.g. `psx_abc123`). Required for
   * {@link ProxiesClient.buildProxyUrl} to construct the customer-facing
   * credential. Available in your Proxies.sx account settings.
   */
  proxyUsername?: string;

  /** Override the API base URL. Default: `https://api.proxies.sx/v1`. */
  baseUrl?: string;

  /** Override the gateway host used by `buildProxyUrl`. Default: `gw.proxies.sx`. */
  gatewayHost?: string;

  /** Request timeout in ms. Default: 30000. */
  timeout?: number;

  /**
   * Retry policy for transient failures (`5xx`, `429`, timeouts, network).
   *
   * - Pass `false` to disable.
   * - Pass an object to tune.
   * - Omit to use the default (3 attempts, 250ms / 1s / 4s + jitter).
   *
   * Retries are SDK-internal — the host app sees a single `await` either
   * resolving or rejecting after backoff is exhausted. Use the SDK's retry
   * by default and remove your own retry wrappers; combining the two
   * causes thundering-herd on transient gateway failures.
   *
   * @since 0.3.0
   */
  retry?: false | RetryConfig;

  /**
   * Custom fetch implementation (useful for Node < 18, edge runtimes, or mocking).
   * Defaults to global `fetch`.
   */
  fetch?: typeof fetch;
}

// ────────────────────────────────────────────────────────────────────────
//  Expiry helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * `true` when the key has an `expiresAt` AND that moment has passed.
 * Returns `false` for keys with no expiry.
 *
 * Prefer the server-computed `key.isExpired` field when available — it
 * uses the platform's clock. This helper is for places where you only
 * have the raw `expiresAt` string.
 */
export function isPoolKeyExpired(
  keyOrExpiry: Pick<PoolAccessKey, 'expiresAt'> | string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  const raw =
    typeof keyOrExpiry === 'string' || keyOrExpiry instanceof Date
      ? keyOrExpiry
      : keyOrExpiry?.expiresAt;
  if (!raw) return false;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) && t <= now;
}

/**
 * Days remaining until the key expires. Returns `null` if no expiry,
 * `0` when within the same day as expiry, negative numbers for already-
 * expired keys (so dashboards can show "expired 3 days ago" if you want).
 *
 * Uses `Math.ceil` so a key expiring in 1.2 days renders as "2 days remaining".
 */
export function daysUntilPoolKeyExpiry(
  keyOrExpiry: Pick<PoolAccessKey, 'expiresAt'> | string | Date | null | undefined,
  now: number = Date.now(),
): number | null {
  const raw =
    typeof keyOrExpiry === 'string' || keyOrExpiry instanceof Date
      ? keyOrExpiry
      : keyOrExpiry?.expiresAt;
  if (!raw) return null;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}
