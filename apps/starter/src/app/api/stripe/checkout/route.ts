import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { queryOne, query } from '@/lib/db';
import { tierById, config } from '@/config';

/**
 * Kick off a Stripe Checkout session for the authenticated user.
 *
 *   GET /api/stripe/checkout?tier=starter
 *
 * Creates (or reuses) a Stripe Customer tied to the user, then redirects
 * the browser to Stripe's hosted checkout. On success Stripe redirects
 * back to /dashboard; the webhook is what actually provisions the key.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login?next=' + encodeURIComponent(req.url), req.url));
  }

  const url = new URL(req.url);
  const tierId = url.searchParams.get('tier');
  if (!tierId) {
    return NextResponse.json({ error: 'Missing tier' }, { status: 400 });
  }
  let tier;
  try {
    tier = tierById(tierId);
  } catch {
    return NextResponse.json({ error: 'Unknown tier' }, { status: 400 });
  }

  const userId = Number((session.user as { id?: string }).id);
  const email = session.user.email ?? undefined;

  // Reuse an existing Stripe customer id if we've checked the user out before.
  const customerRow = await queryOne<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM customers WHERE user_id = $1',
    [userId],
  );
  let stripeCustomerId = customerRow?.stripe_customer_id ?? null;

  if (!stripeCustomerId) {
    const c = await stripe.customers.create({ email, metadata: { userId: String(userId) } });
    stripeCustomerId = c.id;
    await query(
      `INSERT INTO customers (user_id, stripe_customer_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id`,
      [userId, stripeCustomerId],
    );
  }

  const baseUrl = process.env.AUTH_URL ?? url.origin;

  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(tier.priceUsd * 100),
          product_data: {
            name: `${config.brand.name} · ${tier.displayName} (${tier.gb} GB)`,
            metadata: { tierId: tier.id },
          },
        },
      },
    ],
    success_url: `${baseUrl}/dashboard?purchase=ok`,
    cancel_url: `${baseUrl}/#pricing`,
    metadata: {
      userId: String(userId),
      tierId: tier.id,
      gb: String(tier.gb),
    },
  });

  if (!checkout.url) {
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
  return NextResponse.redirect(checkout.url, { status: 303 });
}
