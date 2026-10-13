CREATE SEQUENCE IF NOT EXISTS founder_number_seq AS integer START WITH 1;

CREATE TABLE IF NOT EXISTS "founder" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "founderNumber" integer NOT NULL,
  "countryCode" text NOT NULL,
  "entryMultiplier" double precision NOT NULL,
  "totalPoints" integer NOT NULL DEFAULT 0,
  "walletAddress" text NOT NULL,
  "registeredAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "founder_number_idx" ON "founder" ("founderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "founder_wallet_idx" ON "founder" ("walletAddress");

CREATE TABLE IF NOT EXISTS "founder_country" (
  "countryCode" text PRIMARY KEY NOT NULL,
  "founderCount" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "founder_points_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "actionType" text NOT NULL,
  "basePoints" integer NOT NULL,
  "entryMultiplier" double precision NOT NULL,
  "awardedPoints" integer NOT NULL,
  "dayKey" text NOT NULL,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "founder_points_idempotency_idx" ON "founder_points_ledger" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "founder_points_user_day_idx" ON "founder_points_ledger" ("userId", "dayKey");
