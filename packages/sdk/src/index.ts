/**
 * @proxies-sx/pool-sdk
 *
 * Typed client for the Proxies.sx Pool Gateway reseller API.
 *
 * @packageDocumentation
 */

export { ProxiesClient, PoolKeysApi, PoolApi } from './client';
export { buildProxyUrl, GATEWAY_HOST, HTTP_PORT, SOCKS5_PORT } from './url';
export {
  ProxiesError,
  ProxiesApiError,
  ProxiesTimeoutError,
  ProxiesConfigError,
} from './errors';
export type {
  Country,
  RotationMode,
  Pool,
  Protocol,
  PoolAccessKey,
  CreatePoolAccessKeyInput,
  UpdatePoolAccessKeyInput,
  BuildProxyUrlOpts,
  PoolStock,
  Incident,
  ClientConfig,
} from './types';
