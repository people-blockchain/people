ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "verifiedAt" timestamp;
UPDATE "founder" SET "verifiedAt" = now()
  WHERE "verifiedAt" IS NULL AND ("phoneHash" IS NOT NULL OR ("verificationLevel" >= 2 AND "invitedByUserId" IS NULL));

CREATE TABLE IF NOT EXISTS "founder_referral_activation" (
  "inviteeUserId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "inviterUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "season" integer NOT NULL,
  "proofKey" text NOT NULL,
  "proofAction" text NOT NULL,
  "activatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "founder_referral_activation_inviter_idx" ON "founder_referral_activation" ("inviterUserId", "season");

CREATE TABLE IF NOT EXISTS "founder_referral_credit" (
  "id" text PRIMARY KEY NOT NULL,
  "beneficiaryUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "sourceInviteeUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "season" integer NOT NULL,
  "level" integer NOT NULL,
  "kind" text NOT NULL,
  "points" integer NOT NULL,
  "pplMicro" numeric(38, 0) NOT NULL,
  "dayKey" text NOT NULL,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "founder_referral_credit_idem_idx" ON "founder_referral_credit" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "founder_referral_credit_benef_idx" ON "founder_referral_credit" ("beneficiaryUserId", "season");

CREATE TABLE IF NOT EXISTS "founder_referral_pool" (
  "season" integer PRIMARY KEY NOT NULL,
  "spentPoints" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "founder_referral_ambassador" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "maxActiveInvitees" integer NOT NULL,
  "approvedBy" text NOT NULL,
  "approvedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "founder_referral_claim" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "asset" text NOT NULL,
  "amount" numeric(38, 0) NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "founder_referral_claim_user_idx" ON "founder_referral_claim" ("userId", "asset");

CREATE TABLE IF NOT EXISTS "founder_issuer_referral_program" (
  "tokenAddress" text PRIMARY KEY NOT NULL,
  "issuerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "allocationBps" integer NOT NULL,
  "l1Bps" integer NOT NULL,
  "allocationAmount" numeric(38, 0) NOT NULL,
  "spentAmount" numeric(38, 0) NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "founder_issuer_referral_credit" (
  "id" text PRIMARY KEY NOT NULL,
  "tokenAddress" text NOT NULL,
  "beneficiaryUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "buyerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "level" integer NOT NULL,
  "amount" numeric(38, 0) NOT NULL,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "founder_issuer_referral_credit_idem_idx" ON "founder_issuer_referral_credit" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "founder_issuer_referral_credit_benef_idx" ON "founder_issuer_referral_credit" ("beneficiaryUserId", "tokenAddress");
