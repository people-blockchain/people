-- Separate wallet for Human Passport scoring (see bootstrap-sql.mjs). A wallet already used
-- as someone's walletAddress or passportWallet can never be linked again (anti-sybil).
ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "passportWallet" text;
CREATE UNIQUE INDEX IF NOT EXISTS "founder_passport_wallet_idx" ON "founder" ("passportWallet");
CREATE TABLE IF NOT EXISTS "founder_passport_nonce" (
  "code" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "founder_passport_nonce_user_idx" ON "founder_passport_nonce" ("userId");
