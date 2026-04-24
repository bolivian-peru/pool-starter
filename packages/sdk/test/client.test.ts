import { describe, it, expect, vi } from 'vitest';
import { ProxiesClient } from '../src/client';
import {
  ProxiesApiError,
  ProxiesConfigError,
  ProxiesTimeoutError,
} from '../src/errors';

/** Build a mock fetch that responds with the given status + body. */
function mockFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
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
});
