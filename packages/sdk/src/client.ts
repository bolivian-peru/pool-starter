import type {
  ClientConfig,
  CreatePoolAccessKeyInput,
  UpdatePoolAccessKeyInput,
  PoolAccessKey,
  PoolStock,
  Incident,
  BuildProxyUrlOpts,
} from './types';
import { ProxiesApiError, ProxiesConfigError, ProxiesTimeoutError } from './errors';
import { buildProxyUrl, GATEWAY_HOST } from './url';

const DEFAULT_BASE_URL = 'https://api.proxies.sx/v1';
const DEFAULT_TIMEOUT = 30_000;

/**
 * Primary entry point to the Proxies.sx reseller API.
 *
 * @example
 * ```ts
 * const proxies = new ProxiesClient({
 *   apiKey: process.env.PROXIES_SX_API_KEY!,
 *   proxyUsername: process.env.PROXIES_SX_USERNAME!,
 * });
 *
 * const key = await proxies.poolKeys.create({
 *   label: 'customer:alice',
 *   trafficCapGB: 10,
 * });
 *
 * const url = proxies.buildProxyUrl(key.key, { country: 'us', rotation: 'sticky' });
 * ```
 */
export class ProxiesClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly gatewayHost: string;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;

  /** Your reseller `proxyUsername`, e.g. `psx_abc123`. Set at construction time. */
  public readonly proxyUsername: string | undefined;

  /** Pool Access Key operations. */
  public readonly poolKeys: PoolKeysApi;

  /** Pool health / stock / incident feeds (public, unauthenticated). */
  public readonly pool: PoolApi;

  constructor(config: ClientConfig) {
    if (!config.apiKey) {
      throw new ProxiesConfigError('ProxiesClient: apiKey is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.gatewayHost = config.gatewayHost ?? GATEWAY_HOST;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.proxyUsername = config.proxyUsername;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new ProxiesConfigError(
        'ProxiesClient: global fetch is unavailable. Pass a `fetch` implementation in config.',
      );
    }

    this.poolKeys = new PoolKeysApi(this);
    this.pool = new PoolApi(this);
  }

  /**
   * Build a customer-facing proxy URL. Sugar over the standalone
   * {@link buildProxyUrl} helper, using the `proxyUsername` and `gatewayHost`
   * from this client's config.
   *
   * @throws {ProxiesConfigError} if `proxyUsername` wasn't set on the client.
   */
  buildProxyUrl(pakKey: string, opts: BuildProxyUrlOpts = {}): string {
    if (!this.proxyUsername) {
      throw new ProxiesConfigError(
        'ProxiesClient.buildProxyUrl: proxyUsername must be set in ClientConfig',
      );
    }
    return buildProxyUrl(this.proxyUsername, pakKey, {
      ...opts,
      host: opts.host ?? this.gatewayHost,
    });
  }

  /** @internal Low-level request used by the sub-APIs. Not stable API. */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      Accept: 'application/json',
      'User-Agent': `@proxies-sx/pool-sdk/${VERSION}`,
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (init.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, headers, signal: controller.signal });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new ProxiesTimeoutError(this.timeout);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // Leave `data` undefined; raw `body` still available on the error.
      }
    }

    if (!res.ok) {
      throw new ProxiesApiError(res.status, text, data);
    }
    return data as T;
  }
}

/** Pool Access Key CRUD. */
export class PoolKeysApi {
  constructor(private readonly client: ProxiesClient) {}

  /** Mint a new Pool Access Key. Returns the full key record including the secret `key`. */
  async create(input: CreatePoolAccessKeyInput): Promise<PoolAccessKey> {
    if (!input.label) {
      throw new ProxiesConfigError('poolKeys.create: label is required');
    }
    return this.client.request<PoolAccessKey>('/reseller/pool-keys', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /** List all your Pool Access Keys with current usage. */
  list(): Promise<PoolAccessKey[]> {
    return this.client.request<PoolAccessKey[]>('/reseller/pool-keys');
  }

  /**
   * Update a key. Any field left undefined is untouched.
   *
   * @remarks Setting `enabled: false` takes effect immediately — in-flight
   *   gateway sessions using this key are rejected on the next auth check.
   */
  async update(keyId: string, input: UpdatePoolAccessKeyInput): Promise<PoolAccessKey> {
    if (!keyId) throw new ProxiesConfigError('poolKeys.update: keyId is required');
    return this.client.request<PoolAccessKey>(`/reseller/pool-keys/${encodeURIComponent(keyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  /**
   * Rotate the secret value of a key. Use this if the old value was leaked.
   * The previous `pak_` value is invalidated immediately.
   */
  async regenerate(keyId: string): Promise<{ id: string; key: string }> {
    if (!keyId) throw new ProxiesConfigError('poolKeys.regenerate: keyId is required');
    return this.client.request<{ id: string; key: string }>(
      `/reseller/pool-keys/${encodeURIComponent(keyId)}/regenerate`,
      { method: 'POST' },
    );
  }

  /** Permanently delete a key. Cannot be undone. */
  async delete(keyId: string): Promise<void> {
    if (!keyId) throw new ProxiesConfigError('poolKeys.delete: keyId is required');
    await this.client.request<{ message: string }>(
      `/reseller/pool-keys/${encodeURIComponent(keyId)}`,
      { method: 'DELETE' },
    );
  }
}

/** Public, unauthenticated pool-level endpoints. */
export class PoolApi {
  constructor(private readonly client: ProxiesClient) {}

  /**
   * Live online-endpoint count per country. Safe to call from clients
   * (auth header is still sent but the endpoint itself is public).
   * Cached server-side for 30s.
   */
  getStock(): Promise<PoolStock> {
    return this.client.request<PoolStock>('/gateway/pool/stock');
  }

  /** Active incidents affecting the gateway, if any. Cached 60s. */
  getIncidents(): Promise<Incident[]> {
    return this.client.request<Incident[]>('/gateway/incidents');
  }
}

/** Version string, injected at build time by tsup from package.json. */
declare const __SDK_VERSION__: string;
const VERSION: string =
  typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0-dev';
