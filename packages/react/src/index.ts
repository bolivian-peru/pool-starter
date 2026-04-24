'use client';

/**
 * @proxies-sx/pool-portal-react
 *
 * Drop-in React component + headless hooks for embedding a Proxies.sx Pool
 * Gateway reseller dashboard into any React app.
 *
 * @packageDocumentation
 */

export { PoolPortal } from './PoolPortal';
export type { PoolPortalProps } from './PoolPortal';

export {
  usePoolKey,
  usePoolStock,
  useIncidents,
  useCopyToClipboard,
} from './hooks';

export type {
  Branding,
  Country,
  Incident,
  MeResponse,
  Pool,
  PoolPortalClassNames,
  PoolStock,
  Protocol,
  ProxyUrlPreferences,
  RotationMode,
} from './types';

// Re-export `buildProxyUrl` so callers don't need a second import
export { buildProxyUrl } from '@proxies-sx/pool-sdk';
