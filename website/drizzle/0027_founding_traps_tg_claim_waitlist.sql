-- Founding 1,000 conversion layer: Telegram-first cold-start pending claims (token hashed at rest)
-- and email waitlist (deduplicated by emailHash).

CREATE TABLE IF NOT EXISTS "founder_telegram_pending_claim" (
  "id" text PRIMARY KEY NOT NULL,
  "tokenHash" text NOT NULL,
  "phoneHash" text NOT NULL,
  "telegramUserId" text NOT NULL,
  "chatId" text NOT NULL,
  "locale" text,
  "referredByCode" text,
  "provisionalRefCode" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "claimedAt" timestamp,
  "claimedByUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "founder_tg_pending_claim_token_hash_idx"
  ON "founder_telegram_pending_claim" ("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "founder_tg_pending_claim_phone_hash_idx"
  ON "founder_telegram_pending_claim" ("phoneHash");

CREATE UNIQUE INDEX IF NOT EXISTS "founder_tg_pending_claim_tg_user_idx"
  ON "founder_telegram_pending_claim" ("telegramUserId");

CREATE INDEX IF NOT EXISTS "founder_tg_pending_claim_expires_idx"
  ON "founder_telegram_pending_claim" ("expiresAt");

CREATE TABLE IF NOT EXISTS "founder_email_waitlist" (
  "id" text PRIMARY KEY NOT NULL,
  "emailHash" text NOT NULL,
  "emailNormalized" text NOT NULL,
  "locale" text,
  "sourcePath" text,
  "refCode" text,
  "ipHash" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "founder_email_waitlist_hash_idx"
  ON "founder_email_waitlist" ("emailHash");

CREATE INDEX IF NOT EXISTS "founder_email_waitlist_created_idx"
  ON "founder_email_waitlist" ("createdAt");
