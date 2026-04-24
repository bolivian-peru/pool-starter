/**
 * Base class for all errors thrown by the SDK. Extend this for type-narrowing
 * in host apps: `if (err instanceof ProxiesError) { ... }`.
 */
export class ProxiesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Preserve prototype chain across compilation targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * HTTP error from the Proxies.sx API. Inspect `status` to distinguish auth
 * failures (401/403) from rate limits (429) from upstream problems (5xx).
 */
export class ProxiesApiError extends ProxiesError {
  constructor(
    public readonly status: number,
    public readonly body: string,
    /** Parsed body if JSON, otherwise undefined. */
    public readonly data?: unknown,
  ) {
    super(`Proxies.sx API error ${status}: ${truncate(body, 200)}`);
  }

  /** Convenience: true for 401/403. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Convenience: true for 429. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** Convenience: true for 5xx. */
  get isServer(): boolean {
    return this.status >= 500;
  }
}

/** Thrown when the request times out client-side before the server responds. */
export class ProxiesTimeoutError extends ProxiesError {
  constructor(ms: number) {
    super(`Proxies.sx API request timed out after ${ms}ms`);
  }
}

/** Thrown when the SDK is mis-configured (e.g. missing apiKey). */
export class ProxiesConfigError extends ProxiesError {}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
