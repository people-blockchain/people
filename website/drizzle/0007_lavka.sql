CREATE TABLE IF NOT EXISTS "lavka_merchant" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "displayName" text NOT NULL,
  "countryCode" text NOT NULL,
  "walletAddress" text NOT NULL,
  "ratingSum" integer NOT NULL DEFAULT 0,
  "ratingCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "lavka_merchant_slug_idx" ON "lavka_merchant" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "lavka_merchant_wallet_idx" ON "lavka_merchant" ("walletAddress");

CREATE TABLE IF NOT EXISTS "lavka_loyalty_program" (
  "id" text PRIMARY KEY NOT NULL,
  "merchantUserId" text NOT NULL REFERENCES "lavka_merchant"("userId") ON DELETE CASCADE,
  "chainProgramId" integer NOT NULL,
  "title" text NOT NULL,
  "visitsPerPurchase" integer NOT NULL,
  "validUntil" timestamp,
  "transferable" boolean NOT NULL DEFAULT false,
  "pricePpl" double precision NOT NULL DEFAULT 0,
  "createTxHash" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "lavka_program_chain_id_idx" ON "lavka_loyalty_program" ("chainProgramId");

CREATE TABLE IF NOT EXISTS "lavka_redemption" (
  "id" text PRIMARY KEY NOT NULL,
  "programId" text NOT NULL REFERENCES "lavka_loyalty_program"("id") ON DELETE CASCADE,
  "customerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "walletAddress" text NOT NULL,
  "visits" integer NOT NULL DEFAULT 1,
  "txHash" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "lavka_redemption_tx_idx" ON "lavka_redemption" ("txHash");

CREATE TABLE IF NOT EXISTS "lavka_customer_link" (
  "merchantUserId" text NOT NULL REFERENCES "lavka_merchant"("userId") ON DELETE CASCADE,
  "customerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "firstRedeemAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("merchantUserId", "customerUserId")
);

CREATE TABLE IF NOT EXISTS "lavka_escrow_record" (
  "id" text PRIMARY KEY NOT NULL,
  "chainEscrowId" integer NOT NULL,
  "merchantUserId" text NOT NULL REFERENCES "lavka_merchant"("userId") ON DELETE CASCADE,
  "customerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "amountPpl" double precision NOT NULL,
  "deadline" timestamp,
  "status" text NOT NULL,
  "termsNote" text,
  "createTxHash" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "lavka_escrow_chain_idx" ON "lavka_escrow_record" ("chainEscrowId");
