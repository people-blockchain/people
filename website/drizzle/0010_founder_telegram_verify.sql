CREATE TABLE IF NOT EXISTS "founder_telegram_start_code" (
  "code" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "founder_telegram_start_code_user_idx" ON "founder_telegram_start_code" ("userId");

CREATE TABLE IF NOT EXISTS "founder_telegram_user" (
  "telegramUserId" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "founder_telegram_user_user_idx" ON "founder_telegram_user" ("userId");

ALTER TABLE "founder_telegram_chat" ADD COLUMN IF NOT EXISTS "startCode" text;
