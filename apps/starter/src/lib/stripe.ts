import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error('STRIPE_SECRET_KEY is not set. Get one from https://dashboard.stripe.com/apikeys');
}

/** Singleton Stripe client. */
export const stripe = new Stripe(key, {
  // Pin the API version so upgrades are explicit, not implicit.
  apiVersion: '2024-09-30.acacia' as Stripe.LatestApiVersion,
  typescript: true,
});
