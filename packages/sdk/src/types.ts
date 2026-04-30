/**
 * Countries live in the Proxies.sx Pool Gateway as of 2026.
 * @remarks Pool composition is updated via {@link ProxiesClient.getPoolStock}.
 */
export type Country = 'us' | 'de' | 'pl' | 'fr' | 'es' | 'gb';

/**
 * IP rotation strategy encoded in the proxy username.
 *
 * - `none` — fresh IP per request (default).
 * - `auto10` / `auto30` — rotate every 10/30 minutes.
 * - `sticky` — pin to the same endpoint for the session's lifetime.
 * - `hard` — force a new endpoint on every request (no reuse).
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
   * extending it on each top-up via `update({ expiresAt })`.
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

/** Input to {@link ProxiesClient.poolKeys.create}. */
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
}

/** Input to {@link ProxiesClient.poolKeys.update}. */
export interface UpdatePoolAccessKeyInput {
  label?: string;
  enabled?: boolean;
  trafficCapGB?: number | null;
  /**
   * Pass an ISO/Date in the future to set or extend, `null` to remove an
   * existing expiry, or omit to leave unchanged. Omit/extend on top-up.
   */
  expiresAt?: string | Date | null;
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

/** Pool stock response (unauthenticated public endpoint). */
export interface PoolStock {
  updatedAt: string;
  countries: Array<{
    country: Country;
    mbl: { online: number; total: number };
    peer: { online: number; total: number };
  }>;
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
