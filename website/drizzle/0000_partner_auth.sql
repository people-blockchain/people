-- People's Blockchain — partner portal (Auth.js + partner profile)
-- Idempotent: safe to run multiple times in Neon SQL Editor.
-- Requires: PostgreSQL (Neon). Run once per database.

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "email" text,
  "emailVerified" timestamp,
  "image" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_idx" ON "user" ("email");

CREATE TABLE IF NOT EXISTS "account" (
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  PRIMARY KEY ("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "session" (
  "sessionToken" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "verificationToken" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

CREATE TABLE IF NOT EXISTS "partner" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "referralCode" text NOT NULL,
  "referredByUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "walletAddress" text,
  "walletPublicKey" text,
  "walletBoundAt" timestamp,
  "challengeNonce" text,
  "challengeExpiresAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_referral_code_idx" ON "partner" ("referralCode");
CREATE UNIQUE INDEX IF NOT EXISTS "partner_wallet_address_idx" ON "partner" ("walletAddress");
