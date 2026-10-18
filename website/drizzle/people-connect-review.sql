-- REVIEW ARTIFACT ONLY. Do not apply to a live database without owner approval.
-- The application never executes this DDL or adds it to automatic bootstrap.
-- Requires the already-deployed api_rate_limit table for durable abuse limits.
-- After separate approval/application: set PEOPLE_CONNECT_ENABLED=1 on the site.
CREATE TABLE IF NOT EXISTS "mobile_wallet_session" (
  "id" text PRIMARY KEY,
  "data" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "mobile_wallet_session_expires_idx"
  ON "mobile_wallet_session" ("expires_at");
