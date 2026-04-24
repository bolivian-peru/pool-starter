# @proxies-sx/pool-sdk

[![npm](https://img.shields.io/npm/v/@proxies-sx/pool-sdk)](https://www.npmjs.com/package/@proxies-sx/pool-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)

> Typed TypeScript/JavaScript client for the **[Proxies.sx Pool Gateway](https://client.proxies.sx/pool-proxy)** reseller API. Mint Pool Access Keys, build proxy URLs, and ship a branded reseller business in an hour instead of a month.

Wholesale cost: **$4/GB → $2.40/GB at 250+ GB volume**. You set your resale price. One API call mints a per-customer sub-key with its own traffic cap.

---

## Install

```bash
npm install @proxies-sx/pool-sdk
# or
pnpm add @proxies-sx/pool-sdk
# or
yarn add @proxies-sx/pool-sdk
```

Node ≥ 18.17 or any modern edge runtime with global `fetch` (Vercel Edge, Cloudflare Workers, Deno, Bun).

---

## Quickstart

```ts
import { ProxiesClient } from '@proxies-sx/pool-sdk';

// Server-side only — never bundle PROXIES_SX_API_KEY into the browser.
const proxies = new ProxiesClient({
  apiKey: process.env.PROXIES_SX_API_KEY!,     // psx_...
  proxyUsername: process.env.PROXIES_SX_USERNAME!, // psx_abc123 (your reseller ID)
});

// Mint a key for a customer who just paid
const key = await proxies.poolKeys.create({
  label: 'customer:alice@example.com',
  trafficCapGB: 10,
});

// Build the proxy URL they'll use in their HTTP client
const url = proxies.buildProxyUrl(key.key, {
  country: 'us',
  sid: 'alice',
  rotation: 'sticky',
});
// → "http://psx_abc123-mbl-us-sid-alice-rot-sticky:pak_...@gw.proxies.sx:7000"

// Hand the URL to the customer
await email(customer, url);
```

That's the whole flow. Everything else is bookkeeping.

---

## API surface

### `new ProxiesClient(config)`

```ts
interface ClientConfig {
  apiKey: string;              // Required. psx_... from client.proxies.sx/api-keys
  proxyUsername?: string;      // e.g. "psx_abc123" — required to call buildProxyUrl
  baseUrl?: string;            // Default: "https://api.proxies.sx/v1"
  gatewayHost?: string;        // Default: "gw.proxies.sx"
  timeout?: number;            // Default: 30000 (ms)
  fetch?: typeof fetch;        // Override for older Node or mocking
}
```

### `proxies.poolKeys`

| Method | Returns | Description |
|---|---|---|
| `create({ label, trafficCapGB? })` | `PoolAccessKey` | Mint a new key |
| `list()` | `PoolAccessKey[]` | List all your keys with usage |
| `update(keyId, { label?, enabled?, trafficCapGB? })` | `PoolAccessKey` | Change any field |
| `regenerate(keyId)` | `{ id, key }` | Rotate the secret value (invalidates old) |
| `delete(keyId)` | `void` | Permanently delete |

### `proxies.pool` (public endpoints)

| Method | Returns | Description |
|---|---|---|
| `getStock()` | `PoolStock` | Live endpoint count per country |
| `getIncidents()` | `Incident[]` | Active pool incidents |

### `proxies.buildProxyUrl(pakKey, opts?)`

Instance method using your configured `proxyUsername` and `gatewayHost`.

### `buildProxyUrl(proxyUsername, pakKey, opts?)`

Standalone function — use it if you don't have a client instance on hand.

```ts
import { buildProxyUrl } from '@proxies-sx/pool-sdk';
```

**`opts`:**

| Field | Type | Example |
|---|---|---|
| `country` | `'us' \| 'de' \| 'pl' \| 'fr' \| 'es' \| 'gb'` | `'us'` |
| `carrier` | `string` | `'att'`, `'tmobile'`, `'vodafone'` |
| `city` | `string` | `'nyc'`, `'berlin'` |
| `sid` | `string` | `'customer-123'` (same sid = same endpoint with `rotation: 'sticky'`) |
| `rotation` | `'none' \| 'auto10' \| 'auto30' \| 'sticky' \| 'hard'` | `'sticky'` |
| `pool` | `'mbl' \| 'peer'` | `'mbl'` (mobile modems) or `'peer'` (residential peers) |
| `protocol` | `'http' \| 'socks5'` | `'http'` (port 7000) or `'socks5'` (port 7001) |
| `host` | `string` | Override gateway host, e.g. `'edge-eu.proxies.sx'` |

---

## Complete end-to-end example (Next.js App Router)

```ts
// app/api/stripe/webhook/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { ProxiesClient } from '@proxies-sx/pool-sdk';
import { db } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET!);
const proxies = new ProxiesClient({
  apiKey: process.env.PROXIES_SX_API_KEY!,
  proxyUsername: process.env.PROXIES_SX_USERNAME!,
});

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerId = session.client_reference_id!;
    const gbPurchased = Number(session.metadata?.gb ?? '0');

    // Mint the key with a cap matching what they bought
    const key = await proxies.poolKeys.create({
      label: `customer:${customerId}`,
      trafficCapGB: gbPurchased,
    });

    await db.customers.update(customerId, { pakKeyId: key.id, pakKey: key.key });
  }
  return NextResponse.json({ received: true });
}
```

```tsx
// app/dashboard/page.tsx
import { ProxiesClient } from '@proxies-sx/pool-sdk';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function DashboardPage() {
  const user = await auth();
  const customer = await db.customers.get(user.id);

  const proxies = new ProxiesClient({
    apiKey: process.env.PROXIES_SX_API_KEY!,
    proxyUsername: process.env.PROXIES_SX_USERNAME!,
  });

  const key = await proxies.poolKeys.update(customer.pakKeyId, {}); // no-op fetch to get latest usage
  const url = proxies.buildProxyUrl(customer.pakKey, {
    country: 'us',
    sid: customer.id,
    rotation: 'sticky',
  });

  return (
    <div>
      <h1>Your Proxy</h1>
      <pre>{url}</pre>
      <p>Used {key.trafficUsedGB?.toFixed(2)} GB of {key.trafficCapGB} GB</p>
    </div>
  );
}
```

---

## Error handling

All errors extend `ProxiesError`. Use `instanceof` for type narrowing:

```ts
import { ProxiesApiError, ProxiesTimeoutError } from '@proxies-sx/pool-sdk';

try {
  await proxies.poolKeys.create({ label: 'test' });
} catch (err) {
  if (err instanceof ProxiesApiError) {
    if (err.isAuth) {
      // 401/403 — API key invalid or revoked
    } else if (err.isRateLimited) {
      // 429 — back off
    } else if (err.isServer) {
      // 5xx — retry with backoff
    }
  } else if (err instanceof ProxiesTimeoutError) {
    // Request exceeded the configured timeout
  }
  throw err;
}
```

---

## Security

- **Never** ship `PROXIES_SX_API_KEY` to the browser. The SDK is designed for server-side use (API routes, server components, webhooks, cron).
- The only truly browser-safe export is the standalone `buildProxyUrl()` — and even then, only call it once you've fetched the specific customer's `pak_` from *your own* backend.
- If a `pak_` key leaks, call `proxies.poolKeys.regenerate(keyId)`. The old value stops working immediately.
- Each `pak_` key is scoped to your reseller account. A leaked key can only consume traffic from *your* GB pool, not from other resellers.

---

## Typing + runtime compatibility

- Ships ESM (`import`) and CJS (`require`) + full `.d.ts` types
- Zero dependencies at runtime
- Works in Node 18.17+, Bun, Deno (with `npm:` specifier), Vercel Edge, Cloudflare Workers
- Pass `fetch` in config if your runtime lacks global `fetch`

---

## Development

```bash
git clone https://github.com/proxies-sx/pool-starter
cd pool-starter
pnpm install
pnpm -r --filter @proxies-sx/pool-sdk test
pnpm -r --filter @proxies-sx/pool-sdk build
```

---

## License

MIT — see [LICENSE](../../LICENSE).
