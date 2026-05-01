import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { proxies } from '@/lib/proxies';
import { query, queryOne } from '@/lib/db';
import { tierById, config } from '@/config';

// Stripe signs the raw body; never parse before verifying.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook endpoint.
 *
 * Configure in Stripe dashboard:
 *   Endpoint URL: https://YOUR_DOMAIN/api/stripe/webhook
 *   Events: checkout.session.completed
 *
 * For local dev: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  // Raw body required for signature verification.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  // Idempotency: try to insert the event id. If it's already there, skip.
  try {
    await query(
      'INSERT INTO webhook_events (stripe_event_id, type) VALUES ($1, $2)',
      [event.id, event.type],
    );
  } catch (err) {
    // Duplicate → already processed. Acknowledge 200 so Stripe stops retrying.
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ received: true, deduped: true });
    }
    console.error('webhook_events insert failed:', err);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);
    }
    // Other events acknowledged but ignored.
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // Non-2xx tells Stripe to retry. Delete our idempotency marker so the retry
    // actually runs the handler again instead of being silently deduped.
    await query('DELETE FROM webhook_events WHERE stripe_event_id = $1', [event.id]).catch(() => {});
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }
}

async function handleCheckoutCompleted(sess: Stripe.Checkout.Session): Promise<void> {
  const userIdStr = sess.metadata?.userId;
  const tierId = sess.metadata?.tierId;
  if (!userIdStr || !tierId) {
    console.warn('Missing userId/tierId in checkout metadata; skipping');
    return;
  }
  const userId = Number(userIdStr);
  const tier = tierById(tierId);
  const paidCents = sess.amount_total ?? 0;

  // Atomic: if this stripe_session_id was already processed we'll get a
  // unique-violation and stop here (makes retries safe).
  const inserted = await query(
    `INSERT INTO purchases (user_id, stripe_session_id, amount_usd_cents, gb_purchased, tier_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (stripe_session_id) DO NOTHING
     RETURNING id`,
    [userId, sess.id, paidCents, tier.gb, tier.id],
  );
  if (inserted.length === 0) {
    return; // Already processed
  }

  // Ensure a customers row exists.
  await query(
    `INSERT INTO customers (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  // Add this purchase's GB to the running total, and grow the pak_ cap
  // accordingly. If the user has no pak_ yet, mint one.
  const customer = await queryOne<{
    pak_key_id: string | null;
    total_gb_purchased: string;
  }>(
    'SELECT pak_key_id, total_gb_purchased FROM customers WHERE user_id = $1',
    [userId],
  );

  const newTotalGb = Number(customer?.total_gb_purchased ?? 0) + tier.gb;

  if (!customer?.pak_key_id) {
    // First purchase — mint the key with this tier's GB as the cap.
    // Pass idempotencyKey tied to the Stripe checkout session so a retry
    // (network blip after platform mints the key, before we get the
    // response) returns the cached key instead of minting a second one.
    const key = await proxies.poolKeys.create({
      label: `customer:${userId}`,
      trafficCapGB: newTotalGb,
      idempotencyKey: `mint_${session.id}`,
    });
    await query(
      `UPDATE customers
         SET pak_key_id = $1,
             total_gb_purchased = $2,
             updated_at = NOW()
       WHERE user_id = $3`,
      [key.id, newTotalGb, userId],
    );
  } else {
    // Top-up — raise the cap atomically via topUp(). Server-side $inc
    // means concurrent top-ups don't clobber each other. The
    // idempotencyKey tied to the Stripe session means a retry returns
    // the cached response instead of double-crediting the customer.
    await proxies.poolKeys.topUp(customer.pak_key_id, {
      addTrafficGB: tier.gb,
      idempotencyKey: `topup_${session.id}`,
    });
    await query(
      `UPDATE customers
         SET total_gb_purchased = $1,
             updated_at = NOW()
       WHERE user_id = $2`,
      [newTotalGb, userId],
    );
  }

  console.log(
    `Provisioned ${tier.gb} GB (${config.brand.name} ${tier.id}) for user ${userId}`,
  );
}
