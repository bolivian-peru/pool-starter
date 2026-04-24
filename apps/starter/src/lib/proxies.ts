import { ProxiesClient } from '@proxies-sx/pool-sdk';

/**
 * Singleton ProxiesClient. Uses the reseller API key and proxy username from env.
 * Never imported in Client Components — server-only.
 */
declare global {
  var __proxiesClient: ProxiesClient | undefined;
}

function make(): ProxiesClient {
  const apiKey = process.env.PROXIES_SX_API_KEY;
  const proxyUsername = process.env.PROXIES_SX_USERNAME;
  if (!apiKey) throw new Error('PROXIES_SX_API_KEY is not set');
  if (!proxyUsername) throw new Error('PROXIES_SX_USERNAME is not set');
  return new ProxiesClient({ apiKey, proxyUsername });
}

export const proxies: ProxiesClient = globalThis.__proxiesClient ?? make();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__proxiesClient = proxies;
}
