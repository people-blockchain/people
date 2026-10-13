-- api-cron.md M2: durable (not in-memory) accounting for AI icon generation.
--   * factory_icon_payment_tx — one-shot payment consumption; unique paymentTxId stops a
--     single on-chain payment being replayed across Vercel instances / cold starts.
--   * factory_icon_daily_usage — per-UTC-day free/paid counters (walletAddress '*' = global).
--   * api_rate_limit — generic durable fixed-window limiter for abuse-prone routes.
-- Keep in sync with bootstrap-sql.mjs.
CREATE TABLE IF NOT EXISTS "factory_icon_payment_tx" (
  "id" text PRIMARY KEY NOT NULL,
  "paymentTxId" text NOT NULL,
  "walletAddress" text NOT NULL,
  "dayKey" text NOT NULL,
  "claimedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "factory_icon_payment_tx_id_idx" ON "factory_icon_payment_tx" ("paymentTxId");

CREATE TABLE IF NOT EXISTS "factory_icon_daily_usage" (
  "dayKey" text NOT NULL,
  "walletAddress" text NOT NULL,
  "usedCount" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("dayKey", "walletAddress")
);

CREATE TABLE IF NOT EXISTS "api_rate_limit" (
  "bucketKey" text PRIMARY KEY NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "api_rate_limit_expires_idx" ON "api_rate_limit" ("expiresAt");
