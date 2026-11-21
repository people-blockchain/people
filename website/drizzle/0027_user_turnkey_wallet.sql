-- Turnkey embedded wallet: one sub-organization per Auth.js user.
-- Store only Turnkey ids and the EVM address. Never store private keys.
-- Idempotent: safe to run multiple times. This PR does not apply the migration.

CREATE TABLE IF NOT EXISTS "user_turnkey_wallet" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "subOrganizationId" text NOT NULL,
  "turnkeyUserId" text,
  "walletId" text,
  "address" text,
  "publicKey" text,
  "importedFromVault" boolean NOT NULL DEFAULT false,
  "legacyImportError" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_turnkey_wallet_suborg_idx" ON "user_turnkey_wallet" ("subOrganizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "user_turnkey_wallet_address_idx" ON "user_turnkey_wallet" ("address") WHERE "address" IS NOT NULL;
