ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "verificationLevel" integer NOT NULL DEFAULT 0;
ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "phoneHash" text;
ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "invitedByUserId" text REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "isBot" boolean NOT NULL DEFAULT false;
ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "deviceSlotHash" text;
ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "ipSlotHash" text;
CREATE UNIQUE INDEX IF NOT EXISTS "founder_phone_hash_idx" ON "founder" ("phoneHash");

CREATE TABLE IF NOT EXISTS "founder_phone_registry" (
  "phoneHash" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "founder_slot_count" (
  "slotHash" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "founderCount" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "founder_discover_peer" (
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "peerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "peerUserId")
);

CREATE TABLE IF NOT EXISTS "founder_telegram_chat" (
  "chatId" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL
);
