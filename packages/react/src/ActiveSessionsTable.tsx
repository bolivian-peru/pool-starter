'use client';

import {
  type CSSProperties,
  type JSX,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { ActiveSession } from '@proxies-sx/pool-sdk';
import type { Branding, PoolPortalClassNames } from './types';

/**
 * Props for {@link ActiveSessionsTable}.
 *
 * @public
 */
export interface ActiveSessionsTableProps {
  /** Base path of your mounted `createPoolApiHandlers()`. Default `/api/pool`. */
  apiRoute?: string;
  /**
   * The customer's password to substitute into proxy URLs when copying.
   * Either a `pak_` key or a `proxyPassword`. Held in component state
   * only — never logged or sent server-side.
   */
  proxyPassword: string;
  /** Auto-refresh interval in ms. Default 5000. Set 0 to disable polling. */
  refreshIntervalMs?: number;
  /**
   * Hide synthesized-sid sessions (`auto_*`/`socks5_*`). These are
   * created when a customer connects without `-sid-` and have a 5-min
   * TTL. Default true — they're internal and not user-actionable.
   */
  hideSynthesizedSessions?: boolean;
  /** Called with the closed sessionKey after a successful close. */
  onSessionClosed?: (sessionKey: string) => void;
  /** Called with the count after closeAll resolves. */
  onAllSessionsClosed?: (count: number) => void;
  /** Called when a copy succeeds. */
  onCopy?: (url: string) => void;
  /** Branding (CSS custom properties). */
  branding?: Branding;
  /** Per-part className overrides. */
  classNames?: PoolPortalClassNames;
  /** Extra class on root. */
  className?: string;
  /** Inline style on root. */
  style?: CSSProperties;
}

/**
 * Live table of the current user's gateway sessions. Polls
 * `GET <apiRoute>/my-sessions` at `refreshIntervalMs` (default 5 s).
 *
 * Each row exposes:
 * - The exit IP (updates as rotation fires).
 * - Per-session traffic (bytes in/out, request count).
 * - TTL countdown (when Redis will auto-evict).
 * - Copy-URL button (substitutes `<PASSWORD>` with `proxyPassword`).
 * - Close button — calls `DELETE <apiRoute>/my-sessions/:sessionKey`.
 *
 * Sessions auto-close on TTL — manual close is only for releasing the
 * pinned IP early.
 *
 * @example
 * ```tsx
 * <ActiveSessionsTable
 *   apiRoute="/api/pool"
 *   proxyPassword={me.pakKey}
 *   refreshIntervalMs={5000}
 *   onSessionClosed={(key) => toast.success(`Closed ${key.slice(-12)}`)}
 * />
 * ```
 *
 * @public
 */
export function ActiveSessionsTable(props: ActiveSessionsTableProps): JSX.Element {
  const {
    apiRoute = '/api/pool',
    proxyPassword,
    refreshIntervalMs = 5_000,
    hideSynthesizedSessions = true,
    onSessionClosed,
    onAllSessionsClosed,
    onCopy,
    branding,
    classNames = {},
    className,
    style,
  } = props;

  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingKey, setClosingKey] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const r = await fetch(`${apiRoute}/my-sessions`, { credentials: 'same-origin' });
      if (!r.ok) {
        // Don't blow away prior state — surface the error but keep last-known sessions.
        setError(`Failed to load sessions (HTTP ${r.status})`);
        return;
      }
      const body = (await r.json()) as { sessions: ActiveSession[]; count: number };
      setSessions(body.sessions ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiRoute]);

  useEffect(() => {
    fetchSessions();
    if (refreshIntervalMs <= 0) return;
    const id = setInterval(fetchSessions, refreshIntervalMs);
    return () => clearInterval(id);
  }, [fetchSessions, refreshIntervalMs]);

  const handleClose = useCallback(async (sessionKey: string) => {
    setClosingKey(sessionKey);
    try {
      const r = await fetch(`${apiRoute}/my-sessions/${encodeURIComponent(sessionKey)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (r.ok) {
        onSessionClosed?.(sessionKey);
        // Optimistically remove — next poll will reconcile.
        setSessions((prev) => prev.filter((s) => s.sessionKey !== sessionKey));
      }
    } finally {
      setClosingKey(null);
    }
  }, [apiRoute, onSessionClosed]);

  const handleCloseAll = useCallback(async () => {
    if (!confirm('Close all active sessions? This terminates every live connection — including ones you may still be using.')) return;
    setClosingAll(true);
    try {
      const r = await fetch(`${apiRoute}/my-sessions`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (r.ok) {
        const body = (await r.json()) as { count: number };
        onAllSessionsClosed?.(body.count ?? sessions.length);
        setSessions([]);
      }
    } finally {
      setClosingAll(false);
    }
  }, [apiRoute, onAllSessionsClosed, sessions.length]);

  const handleCopy = useCallback((session: ActiveSession) => {
    const url = session.proxyUrl.replace('<PASSWORD>', encodeURIComponent(proxyPassword));
    void navigator.clipboard?.writeText(url);
    onCopy?.(url);
    setCopiedKey(session.sessionKey);
    setTimeout(() => setCopiedKey((p) => (p === session.sessionKey ? null : p)), 1500);
  }, [proxyPassword, onCopy]);

  const visible = hideSynthesizedSessions
    ? sessions.filter((s) => !s.isSynthesizedSid)
    : sessions;

  return (
    <div
      className={cn('psx', 'psx-sessions', classNames.root, className)}
      style={brandingToStyle(branding, style)}
    >
      <div className="psx-sessions-header">
        <h3 className="psx-sessions-title">
          Active sessions
          {visible.length > 0 && <span className="psx-sessions-count"> ({visible.length})</span>}
        </h3>
        <div className="psx-sessions-actions">
          <button
            type="button"
            onClick={fetchSessions}
            className={cn('psx-button', 'psx-button-ghost', classNames.button)}
            disabled={loading}
          >
            Refresh
          </button>
          {visible.length > 0 && (
            <button
              type="button"
              onClick={handleCloseAll}
              disabled={closingAll}
              className={cn('psx-button', 'psx-button-danger', classNames.button)}
            >
              {closingAll ? 'Closing…' : 'Close all'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="psx-sessions-error">{error}</p>}

      {!loading && visible.length === 0 && (
        <p className="psx-sessions-empty">
          No active sessions. Open a connection to <code>gw.proxies.sx</code> with your proxy URL —
          it'll appear here within a few seconds.
        </p>
      )}

      {visible.length > 0 && (
        <table className={cn('psx-sessions-table', classNames.card)}>
          <thead>
            <tr>
              <th>Country</th>
              <th>Sid</th>
              <th>IP</th>
              <th>Rotation</th>
              <th>Started</th>
              <th>TTL</th>
              <th>Bytes</th>
              <th>Reqs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const isClosing = closingKey === s.sessionKey;
              const flag = COUNTRY_FLAGS[s.country.toLowerCase()] ?? '🌐';
              return (
                <tr key={s.sessionKey}>
                  <td>{flag} {s.country.toUpperCase()} <span className="psx-sessions-pool">/{s.pool}</span></td>
                  <td><code>{s.sessionId}</code></td>
                  <td><code className="psx-sessions-ip">{s.currentIp}</code></td>
                  <td>{s.rotation}</td>
                  <td title={new Date(s.createdAt).toISOString()}>{relativeTime(s.createdAt)}</td>
                  <td title={`Auto-expires at ${new Date(s.expiresAt).toISOString()}`}>{formatTtl(s.ttl)}</td>
                  <td>↓ {formatBytes(s.bytesIn)} / ↑ {formatBytes(s.bytesOut)}</td>
                  <td>{s.requestCount}</td>
                  <td className="psx-sessions-row-actions">
                    <button
                      type="button"
                      onClick={() => handleCopy(s)}
                      className={cn('psx-button', 'psx-button-ghost', classNames.button)}
                    >
                      {copiedKey === s.sessionKey ? 'Copied' : 'Copy URL'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClose(s.sessionKey)}
                      disabled={isClosing}
                      className={cn('psx-button', 'psx-button-danger', classNames.button)}
                    >
                      {isClosing ? 'Closing…' : 'Close'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="psx-sessions-help">
        Sessions auto-close on TTL — closing manually is only needed if you want the IP released
        before the timer fires. Synthesized-sid sessions (5-min TTL) are hidden.
      </p>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const COUNTRY_FLAGS: Record<string, string> = {
  us: '\u{1F1FA}\u{1F1F8}', de: '\u{1F1E9}\u{1F1EA}', gb: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}', fr: '\u{1F1EB}\u{1F1F7}', pl: '\u{1F1F5}\u{1F1F1}',
  ch: '\u{1F1E8}\u{1F1ED}', pa: '\u{1F1F5}\u{1F1E6}', am: '\u{1F1E6}\u{1F1F2}',
};

function formatBytes(n: number | undefined): string {
  const v = n ?? 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTtl(seconds: number | undefined): string {
  const s = seconds ?? 0;
  if (s <= 0) return 'expired';
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 360) / 10} h`;
}

function relativeTime(unixMs: number): string {
  const diff = Date.now() - unixMs;
  if (diff < 1000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  return `${Math.round(diff / 3_600_000)} h ago`;
}

function cn(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function brandingToStyle(b: Branding | undefined, override: CSSProperties | undefined): CSSProperties {
  if (!b) return override ?? {};
  const cssVars: Record<string, string> = {};
  if (b.primaryColor) cssVars['--psx-primary'] = b.primaryColor;
  if (b.accentColor) cssVars['--psx-accent'] = b.accentColor;
  if (b.radius) cssVars['--psx-radius'] = b.radius;
  if (b.fontFamily) cssVars['--psx-font'] = b.fontFamily;
  return { ...cssVars, ...override } as CSSProperties;
}
