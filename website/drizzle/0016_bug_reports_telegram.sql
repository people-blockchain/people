-- Telegram support/bug intake through the verify bot (see bootstrap-sql.mjs).
ALTER TABLE "bug_report" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'bug';
ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'site';
ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "telegramChatId" text;
ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "telegramUsername" text;
ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "telegramPhotoFileId" text;
CREATE TABLE IF NOT EXISTS "telegram_bot_state" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
