-- recon.md R1: durable (not in-memory) rate-limit + access-log trail for the wrap-key route.
-- No key material is stored, only who/when/outcome (see bootstrap-sql.mjs).
CREATE TABLE IF NOT EXISTS "wallet_vault_access_log" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "route" text NOT NULL,
  "outcome" text NOT NULL,
  "ip" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "wallet_vault_access_log_user_idx" ON "wallet_vault_access_log" ("userId", "createdAt");
