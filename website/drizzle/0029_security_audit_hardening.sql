-- Security audit port (AUTH-01 / AUTH-03 / WEB-02): permanent Human Passport wallet
-- registry, World ID proof nonces bound to a user, and one-shot factory-icon ownership
-- proof nonces. Idempotent IF NOT EXISTS so bootstrap and drizzle migrate can both apply it.
CREATE TABLE IF NOT EXISTS "founder_passport_wallet_registry" (
  "walletAddress" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verifiedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "founder_world_id_nonce" (
  "nonce" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "founder_world_id_nonce_user_idx" ON "founder_world_id_nonce" ("userId");
CREATE TABLE IF NOT EXISTS "factory_icon_proof_nonce" (
  "walletAddress" text NOT NULL,
  "nonce" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  PRIMARY KEY ("walletAddress", "nonce")
);
CREATE INDEX IF NOT EXISTS "factory_icon_proof_nonce_expires_idx" ON "factory_icon_proof_nonce" ("expiresAt");
