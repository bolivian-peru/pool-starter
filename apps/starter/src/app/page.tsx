import Link from 'next/link';
import { config } from '@/config';
import { auth } from '@/lib/auth';

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center space-y-6 py-10">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          {config.brand.tagline}
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          One endpoint. Real mobile and residential IPs across{' '}
          {config.countries.map((c) => c.toUpperCase()).join(', ')}.
          Pay only for the traffic you use.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href={session ? '/dashboard' : '/login'}
            className="px-5 py-2.5 rounded-md bg-[var(--brand)] text-[var(--brand-fg)] font-medium hover:opacity-90"
          >
            {session ? 'Go to dashboard' : config.primaryCta}
          </Link>
          <a href="#pricing" className="px-5 py-2.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            View pricing
          </a>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Pricing</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Per-gigabyte plans. No subscriptions, no commitment.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {config.pricing.map((tier) => (
            <div
              key={tier.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col gap-4"
            >
              <div>
                <h3 className="text-lg font-semibold">{tier.displayName}</h3>
                {tier.tagline && (
                  <p className="text-sm text-slate-500 mt-1">{tier.tagline}</p>
                )}
              </div>
              <div className="py-2">
                <div className="text-3xl font-semibold">${tier.priceUsd}</div>
                <div className="text-sm text-slate-500">
                  {tier.gb} GB · ${(tier.priceUsd / tier.gb).toFixed(2)}/GB
                </div>
              </div>
              <Link
                href={session ? `/api/stripe/checkout?tier=${tier.id}` : `/login?next=/api/stripe/checkout?tier=${tier.id}`}
                className="mt-auto block text-center px-4 py-2 rounded-md bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-90"
              >
                {session ? 'Buy' : 'Sign in to buy'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-6 md:grid-cols-3 py-6">
        {[
          { title: 'Real mobile + residential', body: 'Every request routes through a live modem or peer device — not datacenter IPs pretending.' },
          { title: 'Country, carrier, rotation', body: 'Pick your target per request via the username. Sticky sessions, auto-rotation, SOCKS5 — all supported.' },
          { title: 'Usage-based billing', body: `Per-GB pricing. Your bandwidth cap is shown live in the dashboard.` },
        ].map((f) => (
          <div key={f.title} className="space-y-2">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
