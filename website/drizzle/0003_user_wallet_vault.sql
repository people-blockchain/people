-- People's Wallet: per-user encrypted embedded key (Auth.js user id).
-- Idempotent: safe to run multiple times in Neon SQL Editor.

CREATE TABLE IF NOT EXISTS "user_wallet_vault" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "address" text NOT NULL,
  "publicKey" text NOT NULL,
  "encryptedPrivateKey" text NOT NULL,
  "vaultVersion" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_wallet_vault_address_idx" ON "user_wallet_vault" ("address");
