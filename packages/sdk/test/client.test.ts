import { describe, it, expect, vi } from 'vitest';
import { ProxiesClient } from '../src/client';
import {
  ProxiesApiError,
  ProxiesConfigError,
  ProxiesTimeoutError,
} from '../src/errors';

/** Build a mock fetch that responds with the given status + body + optional headers. */
function mockFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const lowered = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      headers: {
        get: (k: string) => lowered[k.toLowerCase()] ?? null,
      },
    } as unknown as Response;
  });
}

const KEY_FIXTURE = {
  id: '65fabc',
  key: 'pak_000000000000000000000001',
  label: 'test',
  enabled: true,
  trafficCapGB: 10,
  trafficUsedMB: 0,
  lastUsedAt: null,
  createdAt: 1_700_000_000_000,
};

describe('ProxiesClient', () => {
  it('throws ProxiesConfigError when apiKey is missing', () => {
    expect(() => new ProxiesClient({ apiKey: '' })).toThrow(ProxiesConfigError);
  });

  it('throws ProxiesConfigError when neither config.fetch nor globalThis.fetch is present', () => {
    const originalFetch = (globalThis as { fetch?: unknown }).fetch;
    // Simulate an environment without global fetch (pre-Node-18, some edge runtimes)
    (globalThis as { fetch?: unknown }).fetch = undefined;
    try {
      expect(() => new ProxiesClient({ apiKey: 'psx_test' })).toThrow(ProxiesConfigError);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    }
  });

  it('sends X-API-Key header on every request', async () => {
    const fetchMock = mockFetch(200, []);
    const client = new ProxiesClient({
      apiKey: 'psx_secret',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.poolKeys.list();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      'X-API-Key': 'psx_secret',
    });
  });

  it('throws ProxiesApiError on 4xx and exposes helpers', async () => {
    const fetchMock = mockFetch(401, { error: 'unauthorized' });
    const client = new ProxiesClient({
      apiKey: 'psx_bad',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const err = await client.poolKeys
      .list()
      .then(() => null)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProxiesApiError);
    expect(err.status).toBe(401);
    expect(err.isAuth).toBe(true);
    expect(err.isRateLimited).toBe(false);
  });

  it('isRateLimited returns true on 429', async () => {
    const fetchMock = mockFetch(429, { error: 'slow down' });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const err = (await client.poolKeys.list().catch((e) => e)) as ProxiesApiError;
    expect(err.isRateLimited).toBe(true);
    expect(err.isServer).toBe(false);
  });

  it('isServer returns true on 5xx', async () => {
    const fetchMock = mockFetch(503, 'upstream down');
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const err = (await client.poolKeys.list().catch((e) => e)) as ProxiesApiError;
    expect(err.isServer).toBe(true);
    expect(err.body).toBe('upstream down');
  });

  it('parses successful JSON responses', async () => {
    const fetchMock = mockFetch(200, [KEY_FIXTURE]);
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const keys = await client.poolKeys.list();
    expect(keys).toHaveLength(1);
    expect(keys[0]?.key).toBe(KEY_FIXTURE.key);
  });

  it('validates create() input client-side', async () => {
    const fetchMock = mockFetch(200, KEY_FIXTURE);
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.poolKeys.create({ label: '' })).rejects.toThrow(ProxiesConfigError);
    // Server is never called when client-side validation fails
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('buildProxyUrl requires proxyUsername in config', () => {
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: mockFetch(200, {}) as unknown as typeof fetch,
    });
    expect(() => client.buildProxyUrl('pak_xxx')).toThrow(ProxiesConfigError);
  });

  it('buildProxyUrl uses configured proxyUsername and gatewayHost', () => {
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      proxyUsername: 'psx_me',
      gatewayHost: 'edge.proxies.sx',
      fetch: mockFetch(200, {}) as unknown as typeof fetch,
    });
    const url = client.buildProxyUrl('pak_yyyyyyyyyyyyyyyyyyyyyyyy', { country: 'us' });
    expect(url).toContain('@edge.proxies.sx:7000');
    expect(url).toContain('psx_me-mbl-us');
  });

  it('translates AbortError into ProxiesTimeoutError', async () => {
    const fetchMock = vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      timeout: 10,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.poolKeys.list()).rejects.toBeInstanceOf(ProxiesTimeoutError);
  });

  it('URL-encodes keyId in path params', async () => {
    const fetchMock = mockFetch(200, { id: 'a/b', key: 'pak_new' });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.poolKeys.regenerate('a/b');
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/reseller/pool-keys/a%2Fb/regenerate');
  });

  // ────────────────────────────────────────────────────────────────────
  //  0.3.0: retry, idempotency, requestId, topUp, get
  // ────────────────────────────────────────────────────────────────────

  it('retries on 502 then succeeds', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      const text = calls < 2 ? 'upstream' : JSON.stringify([KEY_FIXTURE]);
      return {
        ok: calls >= 2,
        status: calls < 2 ? 502 : 200,
        text: async () => text,
        headers: { get: () => null },
      } as unknown as Response;
    });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
      fetch: fetchMock as unknown as typeof fetch,
    });
    const keys = await client.poolKeys.list();
    expect(calls).toBe(2);
    expect(keys).toHaveLength(1);
  });

  it('does NOT retry on 400', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return {
        ok: false,
        status: 400,
        text: async () => 'bad request',
        headers: { get: () => null },
      } as unknown as Response;
    });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.poolKeys.list()).rejects.toBeInstanceOf(ProxiesApiError);
    expect(calls).toBe(1);
  });

  it('honors Retry-After header on 429', async () => {
    let calls = 0;
    const start = Date.now();
    const fetchMock = vi.fn(async () => {
      calls++;
      const ok = calls >= 2;
      return {
        ok,
        status: ok ? 200 : 429,
        text: async () => (ok ? JSON.stringify([KEY_FIXTURE]) : 'rate limited'),
        headers: {
          get: (k: string) =>
            !ok && k.toLowerCase() === 'retry-after' ? '0' : null,
        },
      } as unknown as Response;
    });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
      fetch: fetchMock as unknown as typeof fetch,
    });
    const keys = await client.poolKeys.list();
    expect(keys).toHaveLength(1);
    expect(calls).toBe(2);
    expect(Date.now() - start).toBeLessThan(500); // Retry-After=0 → no delay
  });

  it('disables retry when retry: false', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return {
        ok: false,
        status: 502,
        text: async () => 'upstream',
        headers: { get: () => null },
      } as unknown as Response;
    });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      retry: false,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.poolKeys.list()).rejects.toBeInstanceOf(ProxiesApiError);
    expect(calls).toBe(1);
  });

  it('passes Idempotency-Key header on create', async () => {
    const fetchMock = mockFetch(201, KEY_FIXTURE);
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.poolKeys.create({
      label: 'alice',
      idempotencyKey: 'pi_test_idem_42',
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'pi_test_idem_42',
    });
    // Should NOT pass idempotencyKey through in the body
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.idempotencyKey).toBeUndefined();
  });

  it('populates ProxiesApiError.requestId from X-Request-ID header', async () => {
    const fetchMock = mockFetch(500, 'oops', { 'X-Request-ID': 'req_abc123def' });
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      retry: false,
      fetch: fetchMock as unknown as typeof fetch,
    });
    try {
      await client.poolKeys.list();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProxiesApiError);
      expect((err as ProxiesApiError).requestId).toBe('req_abc123def');
      expect((err as ProxiesApiError).isRetryable).toBe(true);
    }
  });

  it('topUp validates inputs', async () => {
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: mockFetch(200, KEY_FIXTURE) as unknown as typeof fetch,
    });
    await expect(client.poolKeys.topUp('id', {})).rejects.toThrow(
      /addTrafficGB or extendDays/,
    );
    await expect(
      client.poolKeys.topUp('id', { addTrafficGB: -1 }),
    ).rejects.toThrow(/addTrafficGB/);
  });

  it('topUp posts to /:id/topup with body and idempotency header', async () => {
    const fetchMock = mockFetch(200, KEY_FIXTURE);
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.poolKeys.topUp('abc', {
      addTrafficGB: 5,
      extendDays: 30,
      idempotencyKey: 'topup_invoice_42',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/reseller/pool-keys/abc/topup');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Idempotency-Key': 'topup_invoice_42',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ addTrafficGB: 5, extendDays: 30 });
  });

  it('get fetches a single key by id', async () => {
    const fetchMock = mockFetch(200, KEY_FIXTURE);
    const client = new ProxiesClient({
      apiKey: 'psx_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const k = await client.poolKeys.get('65fabc');
    expect(k.id).toBe('65fabc');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/reseller/pool-keys/65fabc');
    expect((init as RequestInit).method).toBeUndefined(); // GET (default)
  });
});
