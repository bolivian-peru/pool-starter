-- =============================================================================
-- Proxies.sx Pool Portal — database schema
--
-- One file, plain SQL, no ORM, no magic. Run with `pnpm db:migrate`.
-- Every statement is idempotent (IF NOT EXISTS / ON CONFLICT).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- NextAuth / Auth.js tables
-- Required by @auth/pg-adapter. Schema is dictated by Auth.js; do not rename.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);

-- -----------------------------------------------------------------------------
-- App tables
-- -----------------------------------------------------------------------------

-- One row per customer, 1:1 with users. Holds the `pak_` mapping and balance.
CREATE TABLE IF NOT EXISTS customers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- MongoDB id of the PoolAccessKey on api.proxies.sx. Nullable until first purchase.
  pak_key_id TEXT,
  -- Stripe customer id, created on first checkout.
  stripe_customer_id TEXT UNIQUE,
  -- Total GB purchased lifetime. Used to raise pak_ cap on each successful purchase.
  total_gb_purchased NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable ledger of completed purchases. One row per successful checkout.
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id TEXT NOT NULL UNIQUE,
  amount_usd_cents INTEGER NOT NULL,
  gb_purchased NUMERIC(12,3) NOT NULL,
  tier_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency log for Stripe webhooks. Inserting a row is the idempotency key.
CREATE TABLE IF NOT EXISTS webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Simple audit trail for security-sensitive events (key rotation, etc.).
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts("userId");
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions("userId");
CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON purchases(user_id);
CREATE INDEX IF NOT EXISTS purchases_created_at_idx ON purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);
