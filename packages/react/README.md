# @proxies-sx/pool-portal-react

[![npm](https://img.shields.io/npm/v/@proxies-sx/pool-portal-react)](https://www.npmjs.com/package/@proxies-sx/pool-portal-react)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)

> Drop-in React component and headless hooks for embedding a **[Proxies.sx Pool Gateway](https://client.proxies.sx/pool-proxy)** reseller dashboard into any React app. Ships with a Next.js API route factory so you can wire it up in five minutes without reinventing the backend.

---

## Install

```bash
npm install @proxies-sx/pool-portal-react @proxies-sx/pool-sdk
```

Peer deps: React 18+, React-DOM 18+.

Optional default styles:

```ts
import '@proxies-sx/pool-portal-react/styles.css';
```

---

## 5-minute quickstart (Next.js App Router)

### 1. Wire up the API route

Create `app/api/pool/[...path]/route.ts`:

```ts
import { createPoolApiHandlers } from '@proxies-sx/pool-portal-react/server';
import { ProxiesClient } from '@proxies-sx/pool-sdk';
import { auth } from '@/lib/auth';           // your auth lib (Clerk/NextAuth/…)
import { db } from '@/lib/db';               // your DB

export const { GET, POST } = createPoolApiHandlers({
  proxies: new ProxiesClient({
    apiKey: process.env.PROXIES_SX_API_KEY!,
    proxyUsername: process.env.PROXIES_SX_USERNAME!,
  }),
  getSessionUserId: async () => (await auth())?.userId ?? null,
  getUserKeyId: async (userId) => {
    const customer = await db.customers.get(userId);
    return customer?.pakKeyId ?? null;
  },
});
```

### 2. Drop the component into any page

```tsx
// app/dashboard/page.tsx
import { PoolPortal } from '@proxies-sx/pool-portal-react';
import '@proxies-sx/pool-portal-react/styles.css';

export default function Dashboard() {
  return (
    <PoolPortal
      apiRoute="/api/pool"
      branding={{ name: 'AcmeProxies', primaryColor: '#6366f1' }}
    />
  );
}
```

That's the whole integration. The browser **never** sees your `PROXIES_SX_API_KEY` — all calls flow through your own API route.

---

## How auth works

```
Customer's browser
      │ (signed-in session via your auth lib)
      ▼
<PoolPortal apiRoute="/api/pool" />
      │ fetch("/api/pool/me", { credentials: 'same-origin' })
      ▼
createPoolApiHandlers()  (your /api/pool/[...path]/route.ts)
      │ getSessionUserId() → who is this?
      │ getUserKeyId()     → which pak_ do they own?
      │ proxies.poolKeys.list() → fetch usage from api.proxies.sx
      ▼
Respond with { proxyUsername, pakKey, usage }
```

The component is strictly UI — it knows nothing about `api.proxies.sx`. Your API route is the trust boundary.

---

## `<PoolPortal>` props

| Prop | Type | Default | Description |
|---|---|---|---|
| `apiRoute` | `string` | `"/api/pool"` | Base path of your mounted handlers |
| `countries` | `Country[]` | `['us','de','pl','fr','es','gb']` | Countries the dropdown offers |
| `defaultCountry` | `Country` | first in `countries` | |
| `defaultProtocol` | `'http' \| 'socks5'` | `'http'` | |
| `defaultRotation` | `RotationMode` | `'none'` | |
| `showStock` | `boolean` | `true` | Show the live-endpoints indicator |
| `showIncidents` | `boolean` | `true` | Show an incident banner when active |
| `showUsage` | `boolean` | `true` | Show the usage bar |
| `branding` | `Branding` | — | `{ name, logoUrl, primaryColor, accentColor, radius, fontFamily }` |
| `classNames` | `PoolPortalClassNames` | — | Per-part className overrides (Tailwind-friendly) |
| `className` | `string` | — | Extra class on the root |
| `style` | `CSSProperties` | — | Inline style on the root |
| `emptyState` | `ReactNode` | — | Rendered when the user has no key yet |
| `onRegenerateKey` | `() => Promise<void>` | — | Called when the user clicks "Regenerate key" |

### Branding

```tsx
<PoolPortal
  branding={{
    name: 'AcmeProxies',
    logoUrl: '/logo.svg',
    primaryColor: '#7c3aed',
    accentColor: '#10b981',
    radius: '12px',
    fontFamily: '"Inter", sans-serif',
  }}
/>
```

Brand values map to CSS custom properties (`--psx-primary`, `--psx-accent`, `--psx-radius`, `--psx-font`). Skip `styles.css` and write your own CSS targeting these variables for total control.

### Tailwind users

```tsx
<PoolPortal
  classNames={{
    root: 'w-full max-w-2xl mx-auto',
    card: 'bg-zinc-900 border-zinc-800 text-zinc-50',
    button: 'bg-indigo-500 hover:bg-indigo-600',
    usageBar: 'bg-zinc-800',
  }}
/>
```

Don't import `styles.css` and write everything in Tailwind.

---

## Headless hooks

Prefer to build your own UI? Use the same data layer:

```tsx
import { usePoolKey, usePoolStock, useIncidents, buildProxyUrl } from '@proxies-sx/pool-portal-react';

function MyDashboard() {
  const me = usePoolKey('/api/pool');
  const stock = usePoolStock('/api/pool');
  const incidents = useIncidents('/api/pool');

  if (me.loading) return <Spinner />;
  if (me.error || !me.data) return <ErrorView onRetry={me.refetch} />;

  const url = buildProxyUrl(me.data.proxyUsername, me.data.pakKey, {
    country: 'us',
    rotation: 'sticky',
  });
  return <MyCustomUI url={url} usage={me.data.usage} stock={stock.data} />;
}
```

All hooks return `{ data, loading, error, refetch }`. `usePoolStock` and `useIncidents` poll every 30s/60s respectively; override with `{ refreshIntervalMs }`.

---

## Server API reference

`createPoolApiHandlers(options)` exposes these routes on whatever path you mount it:

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/me` | required | `MeResponse` — proxy URL ingredients + usage |
| `GET` | `/stock` | public | Live endpoint counts per country |
| `GET` | `/incidents` | public | Active gateway incidents |
| `POST` | `/regenerate` | required | Rotates the user's `pak_` key |

### Options

| Option | Required | Description |
|---|---|---|
| `proxies` | ✅ | `ProxiesClient` instance |
| `getSessionUserId(req)` | ✅ | `string \| null` — who is making this request? |
| `getUserKeyId(userId)` | ✅ | `string \| null` — which `pakKeyId` belongs to this user? |
| `gatewayHost` | | Passed through to the browser for custom edge deployments |
| `onAudit(event)` | | Called on writes (e.g. regenerate). Log to your audit trail. |

### Provisioning a key for a new customer

`createPoolApiHandlers` only reads existing keys. Create them server-side after a successful payment:

```ts
// app/api/stripe/webhook/route.ts
import { ProxiesClient } from '@proxies-sx/pool-sdk';

const proxies = new ProxiesClient({
  apiKey: process.env.PROXIES_SX_API_KEY!,
  proxyUsername: process.env.PROXIES_SX_USERNAME!,
});

// On `checkout.session.completed`:
const key = await proxies.poolKeys.create({
  label: `customer:${session.customer}`,
  trafficCapGB: Number(session.metadata?.gb),
});
await db.customers.update(customerId, { pakKeyId: key.id });
```

---

## Security

- Your `PROXIES_SX_API_KEY` lives **only on the server**. The component never sees it.
- `pak_` keys are only sent to the customer they belong to (enforced by your `getSessionUserId` + `getUserKeyId`).
- If a `pak_` leaks, the user can hit `POST /api/pool/regenerate` (wired to `onRegenerateKey`) to rotate it — the old value stops working immediately.
- `/me` responses are sent with `Cache-Control: private, no-store` so they don't leak via CDN/browser cache.
- Public endpoints (`/stock`, `/incidents`) are cacheable (30s / 60s).

---

## Runtime compatibility

- Works in any React 18+ environment: Next.js App/Pages Router, Vite, Remix, React Router
- Server handlers work on any runtime that supports standard `Request` / `Response` (Node, Vercel Edge, Cloudflare Workers, Deno, Bun)
- ESM + CJS + `.d.ts` types, zero runtime dependencies besides `@proxies-sx/pool-sdk`

---

## License

MIT — see [LICENSE](../../LICENSE).
