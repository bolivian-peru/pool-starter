<div align="center">

# pool-starter

**Open-source reseller toolkit for the Proxies.sx Pool Gateway.**
**Ship a branded mobile-proxy business in an afternoon.**

[![CI](https://github.com/bolivian-peru/pool-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/bolivian-peru/pool-starter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

[**Why**](#why) · [**Quickstart**](#quickstart) · [**Packages**](#packages) · [**Architecture**](#architecture) · [**Customizing**](#customizing) · [**Deploy**](#deploy) · [**Contributing**](#contributing)

</div>

---

## Why

Traditional proxy resale means buying modem hardware, juggling SIM plans, running a farm, and wiring in a developer. Every price hike from your supplier eats your margin.

The [Proxies.sx Pool Gateway](https://client.proxies.sx/pool-proxy) takes care of the infrastructure — you get a single endpoint (`gw.proxies.sx:7000`), wholesale pricing with volume tiers, and a per-customer sub-key system (`pak_*`). Live pricing: see [client.proxies.sx](https://client.proxies.sx) or [api.proxies.sx/v1/x402/pricing](https://api.proxies.sx/v1/x402/pricing).

This repo takes care of the **software** — SDK, drop-in React component, and a full Next.js storefront. Zero paid dependencies beyond what you choose (SMTP provider, hosting).

---

## Packages

```
pool-starter/
├── packages/
│   ├── sdk/         → @proxies-sx/pool-sdk           Typed API client
│   └── react/       → @proxies-sx/pool-portal-react  Drop-in UI + server handlers
└── apps/
    └── starter/     → Full Next.js storefront template
```

| Package | Version | What it's for |
|---------|---------|---------------|
| [`@proxies-sx/pool-sdk`](./packages/sdk) | `0.1.0` | Mint Pool Access Keys, build proxy URLs, fetch usage. Zero deps. Works in Node, Bun, Deno, Edge Workers. |
| [`@proxies-sx/pool-portal-react`](./packages/react) | `0.1.0` | `<PoolPortal />` component + headless hooks + `createPoolApiHandlers()` Next.js route factory. |
| [`apps/starter`](./apps/starter) | `0.1.0` | Complete Next.js App Router storefront — landing, pricing, magic-link login, Stripe checkout, self-hosted Postgres. Under 1,000 LOC including comments. |

---

## Quickstart

### Deploy a full storefront in 10 minutes

```bash
git clone https://github.com/bolivian-peru/pool-starter.git my-shop
cd my-shop/apps/starter
cp .env.example .env         # fill in PROXIES_SX_*, STRIPE_*, AUTH_SECRET
pnpm install
docker compose up -d db      # starts Postgres on :5432
pnpm db:migrate               # creates all tables
pnpm dev                      # → http://localhost:3000
```

In another terminal:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Visit `http://localhost:3000`, click **Sign in** (the magic link prints to the server console in dev — no SMTP needed), click **Buy**, pay with test card `4242 4242 4242 4242`. The webhook mints your `pak_` key and the dashboard shows your live proxy URL.

### Embed the dashboard in an existing app

```bash
npm install @proxies-sx/pool-portal-react @proxies-sx/pool-sdk
```

```tsx
import { PoolPortal } from '@proxies-sx/pool-portal-react';
import '@proxies-sx/pool-portal-react/styles.css';

<PoolPortal apiRoute="/api/pool" branding={{ name: 'AcmeProxies' }} />
```

Plus one API route (`app/api/pool/[...path]/route.ts`) — see the [React package README](./packages/react/README.md).

### Just the SDK

```bash
npm install @proxies-sx/pool-sdk
```

```ts
import { ProxiesClient } from '@proxies-sx/pool-sdk';

const proxies = new ProxiesClient({
  apiKey: process.env.PROXIES_SX_API_KEY!,
  proxyUsername: process.env.PROXIES_SX_USERNAME!,
});

const key = await proxies.poolKeys.create({ label: 'alice', trafficCapGB: 10 });
const url = proxies.buildProxyUrl(key.key, { country: 'us', rotation: 'sticky' });
```

Details: [SDK README](./packages/sdk/README.md).

### Not on JavaScript? You can still integrate

The SDK is a thin wrapper around a public REST API. **Any language with an HTTP client works** — PHP, Python, Ruby, Go, Rust, Elixir, even bash + curl.

```bash
# Mint a pak_ key for a customer
curl -X POST https://api.proxies.sx/v1/reseller/pool-keys \
  -H "X-API-Key: psx_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"customer:alice","trafficCapGB":10}'

# → { "id": "...", "key": "pak_...", "trafficCapGB": 10, ... }
```

The proxy URL is just plain HTTP Basic auth — works with any HTTP/SOCKS5 client in any language:

```
http://psx_RESELLER-mbl-us-sid-alice-rot-sticky:pak_CUSTOMER_KEY@gw.proxies.sx:7000
```

Endpoints (`X-API-Key` auth, [`psx_` keys minted at client.proxies.sx/account](https://client.proxies.sx/account)):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/reseller/pool-keys` | Mint key |
| `GET` | `/v1/reseller/pool-keys` | List keys + usage |
| `PATCH` | `/v1/reseller/pool-keys/:id` | Update label / cap |
| `POST` | `/v1/reseller/pool-keys/:id/regenerate` | Rotate secret |
| `DELETE` | `/v1/reseller/pool-keys/:id` | Delete |

Full spec: [api.proxies.sx/docs/api](https://api.proxies.sx/docs/api) (Swagger UI) | [api.proxies.sx/docs/api-json](https://api.proxies.sx/docs/api-json) (OpenAPI 3.0)

Per-language examples (Python, PHP, Go, Ruby): see [SDK README](./packages/sdk/README.md#not-using-javascript-call-the-rest-api-directly).

---

## Architecture

```
Your customer's browser                        Proxies.sx
       │                                           │
       │  1. HTTPS to your storefront              │
       ▼                                           │
┌──────────────────────┐                           │
│  Next.js app         │                           │
│  (yourdomain.com)    │                           │
│                      │                           │
│  /login              ← NextAuth magic link       │
│  /dashboard          ← <PoolPortal />            │
│  /api/stripe/*       ← Checkout + webhook        │
│  /api/pool/*         ───── ProxiesClient ────────┼─▶ api.proxies.sx
└───────┬──────────────┘                           │   /v1/reseller/pool-keys
        │                                          │
        ▼                                          │
┌──────────────────────┐                           │
│  Postgres            │                           │
│  users, sessions,    │                           │
│  customers,          │                           │
│  purchases,          │                           │
│  webhook_events,     │                           │
│  audit_log           │                           │
└──────────────────────┘                           │
                                                   │
       Customer's proxy traffic (CONNECT/SOCKS5)   │
       ──────────────────────────────────────────▶ gw.proxies.sx:7000
       with pak_ key in proxy Basic-Auth           :7001
```

**Key trust boundary:** your `PROXIES_SX_API_KEY` lives only on *your* server. The browser never sees it.

---

## Customizing

### What most resellers change

Everything a reseller typically wants to change lives in **one file**: [`apps/starter/src/config.ts`](./apps/starter/src/config.ts).

```ts
export const config = {
  brand: {
    name: 'AcmeProxies',
    tagline: 'Enterprise-grade mobile proxies',
    supportEmail: 'hello@acme.example',
    primaryColor: '#7c3aed',
    accentColor: '#10b981',
    logoUrl: '/logo.svg',
  },
  pricing: [
    { id: 'starter', displayName: 'Starter', gb: 5,   priceUsd: 35 },
    { id: 'pro',     displayName: 'Pro',     gb: 25,  priceUsd: 150 },
    { id: 'scale',   displayName: 'Scale',   gb: 100, priceUsd: 500 },
  ],
  countries: ['us', 'de', 'pl', 'fr', 'es', 'gb'],
  primaryCta: 'Get started',
  legal: { tosUrl: '/terms', privacyUrl: '/privacy' },
};
```

### For AI-agent-assisted customization

Read [`CLAUDE.md`](./CLAUDE.md) at the repo root and [`apps/starter/CLAUDE.md`](./apps/starter/CLAUDE.md). They document every common task (change brand, change pricing, add a country, add an admin page) with file paths and line numbers. An AI agent can execute any of them without grepping the source.

---

## Deploy

### Self-host on a VPS ($5/month+ works)

```bash
git clone <your-fork> pool-portal && cd pool-portal/apps/starter
cp .env.example .env           # fill in production values
docker compose up --build -d   # Postgres + app, auto-migrates
```

Point Caddy / nginx at `localhost:3000` for TLS. Example Caddy config:

```
yourdomain.com {
  reverse_proxy localhost:3000
}
```

Details: [apps/starter/README.md](./apps/starter/README.md).

### Requirements

- Node.js 20+
- pnpm 9+ (`corepack enable`)
- Docker (optional — you can bring your own Postgres)
- Proxies.sx reseller API key (mint at [client.proxies.sx/account](https://client.proxies.sx/account))
- Stripe account (test mode is fine for development)
- Any SMTP provider for production email, or skip it — dev mode logs magic links to the console

---

## Security

This repo takes security seriously. Every release is audited to ensure:

- ✅ **No secrets are ever committed.** Only `.env.example` with placeholders.
- ✅ **SQL is parameterized** — `pg` `$1` placeholders, never string interpolation.
- ✅ **Stripe webhooks verify signatures** — required signature check, never disabled.
- ✅ **Webhook idempotency** via unique `stripe_event_id` in `webhook_events`.
- ✅ **`/me` responses uncacheable** (`Cache-Control: private, no-store`).
- ✅ **API keys stay server-side.** The `proxies` client is never imported in `'use client'` files.
- ✅ **Sessions are database-backed** — not JWTs — so signout is instant.
- ✅ **Dev-mode console logger** means you can test the full auth flow with zero SMTP setup and zero risk of accidentally emailing yourself from production.

If you find a vulnerability, please email `security@proxies.sx` rather than opening a public issue.

---

## Contributing

Contributions are welcome. Please:

1. Open an issue first for non-trivial changes — saves us both time.
2. Match the coding style (strict TypeScript, no `any` unless commented, parameterized SQL, no new dependencies without discussion).
3. Add tests for any new SDK or hook functionality.
4. Update the relevant README + `CLAUDE.md` if behavior changes.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

---

## FAQ

**Q: Why NextAuth and not Clerk / Auth0 / Supabase Auth?**
A: NextAuth (Auth.js) is free and runs on your own Postgres. Every other option either costs money per MAU or couples you to a third-party service. Magic-link email is all most reseller businesses need.

**Q: Why raw Postgres and not Prisma / Drizzle?**
A: A `schema.sql` file is readable by anyone who knows SQL. There's no generated client, no migration framework to learn, no hidden magic. The whole data layer is ~30 lines in [`src/lib/db.ts`](./apps/starter/src/lib/db.ts).

**Q: Why Stripe-only?**
A: Starting simple. x402/USDC payment support ships in a future release for AI-agent customers. Open a PR if you want it sooner.

**Q: Can I use this without being a Proxies.sx reseller?**
A: You need a Proxies.sx reseller API key to mint `pak_` sub-keys. Sign up at [client.proxies.sx](https://client.proxies.sx), upgrade to reseller access (email us), then mint an API key.

**Q: What's my cost structure?**
A: You pay Proxies.sx wholesale (current rates + volume tiers in your [client.proxies.sx](https://client.proxies.sx) dashboard). You set your retail price. Typical markups on resold mobile proxies are 2–5×. Stripe takes 2.9% + 30¢ per transaction on top.

**Q: Can I fork and re-brand without attribution?**
A: Yes — MIT license. Do whatever you want. No attribution required.

---

## License

MIT © 2026 Proxies.sx — see [LICENSE](LICENSE).

---

<div align="center">
<sub>Built by <a href="https://proxies.sx">Proxies.sx</a> · Docs: <a href="https://client.proxies.sx/pool-proxy">client.proxies.sx/pool-proxy</a></sub>
</div>
