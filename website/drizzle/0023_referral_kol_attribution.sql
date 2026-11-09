-- Migration 0023: Referral & KOL attribution, off-chain PplCurveHub Bought/Sold matching, and commission ledger.

ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "kolCode" text;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referredByKolCode" text;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referralAttachedAt" timestamp;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referralCookieSetAt" timestamp;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "kolTierOverrideBps" integer;
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "kolStatus" text NOT NULL DEFAULT 'active';
ALTER TABLE "partner" ADD COLUMN IF NOT EXISTS "referralClicks" integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "partner_kol_code_lower_idx" ON "partner" (lower("kolCode"));
CREATE INDEX IF NOT EXISTS "partner_referred_by_user_idx" ON "partner" ("referredByUserId");
CREATE INDEX IF NOT EXISTS "partner_referred_by_kol_idx" ON "partner" (lower("referredByKolCode"));

CREATE TABLE IF NOT EXISTS "sale_buyer_binding" (
  "buyerWallet" text PRIMARY KEY NOT NULL,
  "peopleAddress" text,
  "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "referrerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "kolCode" text,
  "source" text NOT NULL DEFAULT 'cookie',
  "cookieSetAt" timestamp,
  "boundAt" timestamp NOT NULL DEFAULT now(),
  "ipHash" text,
  "deviceHash" text
);

CREATE INDEX IF NOT EXISTS "sale_buyer_binding_user_idx" ON "sale_buyer_binding" ("userId");
CREATE INDEX IF NOT EXISTS "sale_buyer_binding_referrer_idx" ON "sale_buyer_binding" ("referrerUserId");
CREATE INDEX IF NOT EXISTS "sale_buyer_binding_kol_idx" ON "sale_buyer_binding" (lower("kolCode"));

CREATE TABLE IF NOT EXISTS "sale_chain_cursor" (
  "chainId" integer NOT NULL,
  "contractAddress" text NOT NULL,
  "lastScannedBlock" integer NOT NULL DEFAULT 0,
  "lastBlockHash" text,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("chainId", "contractAddress")
);

CREATE TABLE IF NOT EXISTS "sale_purchase" (
  "id" text PRIMARY KEY NOT NULL,
  "chainId" integer NOT NULL DEFAULT 8453,
  "contractAddress" text NOT NULL,
  "txHash" text NOT NULL,
  "logIndex" integer NOT NULL DEFAULT 0,
  "blockNumber" integer NOT NULL,
  "blockHash" text NOT NULL,
  "blockTimestamp" timestamp NOT NULL,
  "eventKind" text NOT NULL DEFAULT 'buy',
  "buyerAddress" text NOT NULL,
  "beneficiaryAddress" text NOT NULL,
  "tokenAddress" text NOT NULL,
  "usdMicro" numeric(38, 0) NOT NULL,
  "pplMicro" numeric(38, 0) NOT NULL,
  "soldAfterMicro" numeric(38, 0),
  "buyerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "referrerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "kolCode" text,
  "attributionMethod" text NOT NULL DEFAULT 'unattributed',
  "status" text NOT NULL DEFAULT 'confirmed',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sale_purchase_chain_tx_log_idx" ON "sale_purchase" ("chainId", lower("txHash"), "logIndex");
CREATE INDEX IF NOT EXISTS "sale_purchase_buyer_idx" ON "sale_purchase" ("buyerAddress", "blockTimestamp");
CREATE INDEX IF NOT EXISTS "sale_purchase_referrer_idx" ON "sale_purchase" ("referrerUserId", "status");
CREATE INDEX IF NOT EXISTS "sale_purchase_kol_idx" ON "sale_purchase" (lower("kolCode"), "status");

CREATE TABLE IF NOT EXISTS "referral_payout_batch" (
  "id" text PRIMARY KEY NOT NULL,
  "beneficiaryUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "periodKey" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "usdcAmountMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "pplAmountMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "usdcNetwork" text NOT NULL DEFAULT 'base',
  "pplNetwork" text NOT NULL DEFAULT 'people_mainnet',
  "usdcTxHash" text,
  "pplTxHash" text,
  "paidAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "referral_payout_batch_user_idx" ON "referral_payout_batch" ("beneficiaryUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "referral_commission_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "purchaseId" text NOT NULL REFERENCES "sale_purchase"("id") ON DELETE CASCADE,
  "beneficiaryUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "buyerUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "buyerAddress" text NOT NULL,
  "program" text NOT NULL DEFAULT 'kol',
  "level" integer NOT NULL DEFAULT 1,
  "usdcRateBps" integer NOT NULL DEFAULT 700,
  "pplRateBps" integer NOT NULL DEFAULT 300,
  "usdPurchaseMicro" numeric(38, 0) NOT NULL,
  "pplPurchaseMicro" numeric(38, 0) NOT NULL,
  "grossUsdcMicro" numeric(38, 0) NOT NULL,
  "grossPplMicro" numeric(38, 0) NOT NULL,
  "clawedBackUsdcMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "clawedBackPplMicro" numeric(38, 0) NOT NULL DEFAULT '0',
  "netUsdcMicro" numeric(38, 0) NOT NULL,
  "netPplMicro" numeric(38, 0) NOT NULL,
  "usdcSettlementNetwork" text NOT NULL DEFAULT 'base',
  "pplSettlementNetwork" text NOT NULL DEFAULT 'people_mainnet',
  "isPplLocked" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending',
  "voidReason" text,
  "holdUntil" timestamp NOT NULL,
  "payoutBatchId" text REFERENCES "referral_payout_batch"("id") ON DELETE SET NULL,
  "paidTxHashBase" text,
  "paidTxHashPeople" text,
  "paidAt" timestamp,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_commission_idem_idx" ON "referral_commission_ledger" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "referral_commission_benef_status_idx" ON "referral_commission_ledger" ("beneficiaryUserId", "status", "holdUntil");
CREATE INDEX IF NOT EXISTS "referral_commission_buyer_idx" ON "referral_commission_ledger" ("buyerAddress", "status");
