/**
 * Partner portal DDL — keep in sync with `website/drizzle/0000_partner_auth.sql`.
 * Runtime bootstrap executes these statements (idempotent IF NOT EXISTS).
 */
export const PARTNER_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "email" text,
  "emailVerified" timestamp,
  "image" text
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_email_idx" ON "user" ("email")`,
  `CREATE TABLE IF NOT EXISTS "account" (
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
)`,
  `CREATE TABLE IF NOT EXISTS "session" (
  "sessionToken" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires" timestamp NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "verificationToken" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp NOT NULL,
  PRIMARY KEY ("identifier", "token")
)`,
  `CREATE TABLE IF NOT EXISTS "partner" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "referralCode" text NOT NULL,
  "referredByUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "walletAddress" text,
  "walletPublicKey" text,
  "walletBoundAt" timestamp,
  "challengeNonce" text,
  "challengeExpiresAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "partner_referral_code_idx" ON "partner" ("referralCode")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "partner_wallet_address_idx" ON "partner" ("walletAddress")`,
];

/** Keep in sync with `website/drizzle/0003_user_wallet_vault.sql`. */
export const WALLET_VAULT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "user_wallet_vault" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "address" text NOT NULL,
  "publicKey" text NOT NULL,
  "encryptedPrivateKey" text NOT NULL,
  "vaultVersion" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_wallet_vault_address_idx" ON "user_wallet_vault" ("address")`,
];

/** Keep in sync with `website/drizzle/0001_discover_feed.sql`. */
export const DISCOVER_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "discover_project" (
  "id" text PRIMARY KEY NOT NULL,
  "authorUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "videoUri" text NOT NULL,
  "idea" text NOT NULL,
  "audience" text NOT NULL,
  "whyToken" text NOT NULL,
  "tokenAssetId" text NOT NULL,
  "tokenLink" text NOT NULL,
  "productUrl" text,
  "stageIndex" integer NOT NULL DEFAULT 0,
  "revision" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "weightedScore" double precision NOT NULL DEFAULT 0,
  "isSeed" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "discover_exposure" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId")
)`,
  `CREATE TABLE IF NOT EXISTS "discover_reaction" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "vote" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId", "revision")
)`,
  `CREATE TABLE IF NOT EXISTS "discover_follow" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId")
)`,
  `CREATE TABLE IF NOT EXISTS "discover_question" (
  "id" text PRIMARY KEY NOT NULL,
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "body" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "discover_product_click" (
  "id" text PRIMARY KEY NOT NULL,
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "discover_card_visit" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "visitCount" integer NOT NULL DEFAULT 1,
  "firstAt" timestamp NOT NULL DEFAULT now(),
  "lastAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId")
)`,
  `CREATE TABLE IF NOT EXISTS "discover_site_visit" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "visitedAt" timestamp NOT NULL DEFAULT now()
)`,
  `ALTER TABLE "discover_project" ALTER COLUMN "videoUri" DROP NOT NULL`,
  `ALTER TABLE "discover_project" ADD COLUMN IF NOT EXISTS "screenshotUris" text NOT NULL DEFAULT '[]'`,
  `ALTER TABLE "discover_project" ADD COLUMN IF NOT EXISTS "tokenIconUri" text`,
];

/** Keep in sync with `website/drizzle/0004_founders.sql`. */
export const FOUNDERS_SCHEMA_STATEMENTS = [
  `CREATE SEQUENCE IF NOT EXISTS founder_number_seq AS integer START WITH 1`,
  `CREATE TABLE IF NOT EXISTS "founder" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "founderNumber" integer NOT NULL,
  "countryCode" text NOT NULL,
  "entryMultiplier" double precision NOT NULL,
  "totalPoints" integer NOT NULL DEFAULT 0,
  "walletAddress" text NOT NULL,
  "registeredAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_number_idx" ON "founder" ("founderNumber")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_wallet_idx" ON "founder" ("walletAddress")`,
  `CREATE TABLE IF NOT EXISTS "founder_country" (
  "countryCode" text PRIMARY KEY NOT NULL,
  "founderCount" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "founder_points_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "actionType" text NOT NULL,
  "basePoints" integer NOT NULL,
  "entryMultiplier" double precision NOT NULL,
  "awardedPoints" integer NOT NULL,
  "dayKey" text NOT NULL,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_points_idempotency_idx" ON "founder_points_ledger" ("idempotencyKey")`,
  `CREATE INDEX IF NOT EXISTS "founder_points_user_day_idx" ON "founder_points_ledger" ("userId", "dayKey")`,
];

/** Keep in sync with `website/drizzle/0005_founders_verification.sql`. */
export const FOUNDERS_V2_SCHEMA_STATEMENTS = [
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "verificationLevel" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "phoneHash" text`,
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "invitedByUserId" text REFERENCES "user"("id") ON DELETE SET NULL`,
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "isBot" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "deviceSlotHash" text`,
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "ipSlotHash" text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_phone_hash_idx" ON "founder" ("phoneHash")`,
  `CREATE TABLE IF NOT EXISTS "founder_phone_registry" (
  "phoneHash" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "founder_slot_count" (
  "slotHash" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "founderCount" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "founder_discover_peer" (
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "peerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "peerUserId")
)`,
  `CREATE TABLE IF NOT EXISTS "founder_telegram_chat" (
  "chatId" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL
)`,
];

/** Keep in sync with `website/drizzle/0006_founders_world_id_nullifier.sql`. */
export const FOUNDERS_WORLD_ID_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "founder_world_id_nullifier" (
  "nullifier" numeric(78, 0) NOT NULL,
  "action" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verifiedAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("nullifier", "action")
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_world_id_user_action_idx" ON "founder_world_id_nullifier" ("userId", "action")`,
];

/** Keep in sync with `website/drizzle/0009_founder_demo_airdrop.sql`. */
export const FOUNDER_DEMO_AIRDROP_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "founder_demo_token_airdrop" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "walletAddress" text NOT NULL,
  "grantedAt" timestamp NOT NULL DEFAULT now(),
  "txSummary" text
)`,
  `CREATE INDEX IF NOT EXISTS "founder_demo_token_airdrop_wallet_idx" ON "founder_demo_token_airdrop" ("walletAddress")`,
];

/** Keep in sync with `website/drizzle/0011_founder_referral.sql`. */
export const FOUNDER_REFERRAL_SCHEMA_STATEMENTS = [
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "verifiedAt" timestamp`,
  `UPDATE "founder" SET "verifiedAt" = now() WHERE "verifiedAt" IS NULL AND ("phoneHash" IS NOT NULL OR ("verificationLevel" >= 2 AND "invitedByUserId" IS NULL))`,
  `CREATE TABLE IF NOT EXISTS "founder_referral_activation" (
  "inviteeUserId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "inviterUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "season" integer NOT NULL,
  "proofKey" text NOT NULL,
  "proofAction" text NOT NULL,
  "activatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS "founder_referral_activation_inviter_idx" ON "founder_referral_activation" ("inviterUserId", "season")`,
  `CREATE TABLE IF NOT EXISTS "founder_referral_credit" (
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
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_referral_credit_idem_idx" ON "founder_referral_credit" ("idempotencyKey")`,
  `CREATE INDEX IF NOT EXISTS "founder_referral_credit_benef_idx" ON "founder_referral_credit" ("beneficiaryUserId", "season")`,
  `CREATE TABLE IF NOT EXISTS "founder_referral_pool" (
  "season" integer PRIMARY KEY NOT NULL,
  "spentPoints" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "founder_referral_ambassador" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "maxActiveInvitees" integer NOT NULL,
  "approvedBy" text NOT NULL,
  "approvedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "founder_referral_claim" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "asset" text NOT NULL,
  "amount" numeric(38, 0) NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS "founder_referral_claim_user_idx" ON "founder_referral_claim" ("userId", "asset")`,
  `CREATE TABLE IF NOT EXISTS "founder_issuer_referral_program" (
  "tokenAddress" text PRIMARY KEY NOT NULL,
  "issuerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "allocationBps" integer NOT NULL,
  "l1Bps" integer NOT NULL,
  "allocationAmount" numeric(38, 0) NOT NULL,
  "spentAmount" numeric(38, 0) NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS "founder_issuer_referral_credit" (
  "id" text PRIMARY KEY NOT NULL,
  "tokenAddress" text NOT NULL,
  "beneficiaryUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "buyerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "level" integer NOT NULL,
  "amount" numeric(38, 0) NOT NULL,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_issuer_referral_credit_idem_idx" ON "founder_issuer_referral_credit" ("idempotencyKey")`,
  `CREATE INDEX IF NOT EXISTS "founder_issuer_referral_credit_benef_idx" ON "founder_issuer_referral_credit" ("beneficiaryUserId", "tokenAddress")`,
];

/** Keep in sync with `website/drizzle/0007_lavka.sql`. */
export const LAVKA_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "lavka_merchant" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "displayName" text NOT NULL,
  "countryCode" text NOT NULL,
  "walletAddress" text NOT NULL,
  "ratingSum" integer NOT NULL DEFAULT 0,
  "ratingCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lavka_merchant_slug_idx" ON "lavka_merchant" ("slug")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lavka_merchant_wallet_idx" ON "lavka_merchant" ("walletAddress")`,
  `CREATE TABLE IF NOT EXISTS "lavka_loyalty_program" (
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
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lavka_program_chain_id_idx" ON "lavka_loyalty_program" ("chainProgramId")`,
  `CREATE TABLE IF NOT EXISTS "lavka_redemption" (
  "id" text PRIMARY KEY NOT NULL,
  "programId" text NOT NULL REFERENCES "lavka_loyalty_program"("id") ON DELETE CASCADE,
  "customerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "walletAddress" text NOT NULL,
  "visits" integer NOT NULL DEFAULT 1,
  "txHash" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lavka_redemption_tx_idx" ON "lavka_redemption" ("txHash")`,
  `CREATE TABLE IF NOT EXISTS "lavka_customer_link" (
  "merchantUserId" text NOT NULL REFERENCES "lavka_merchant"("userId") ON DELETE CASCADE,
  "customerUserId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "firstRedeemAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("merchantUserId", "customerUserId")
)`,
  `CREATE TABLE IF NOT EXISTS "lavka_escrow_record" (
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
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lavka_escrow_chain_idx" ON "lavka_escrow_record" ("chainEscrowId")`,
];

/**
 * drizzle/0014_founder_public_profile_opt_in.sql — opt-in for showing a founder's
 * name/avatar in public lists on /transparency. Default false.
 */
export const FOUNDER_PUBLIC_PROFILE_SCHEMA_STATEMENTS = [
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "publicProfileOptIn" boolean NOT NULL DEFAULT false`,
];

/** Keep in sync with `website/drizzle/0015_bug_reports.sql`. */
export const BUG_REPORTS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "bug_report" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "screenshotData" text,
  "context" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'new',
  "severity" text,
  "rewardPoints" integer NOT NULL DEFAULT 0,
  "adminNote" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS "bug_report_user_idx" ON "bug_report" ("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "bug_report_status_idx" ON "bug_report" ("status", "createdAt")`,
  // drizzle/0016_bug_reports_telegram.sql — Telegram support/bug intake via the verify bot.
  `ALTER TABLE "bug_report" ALTER COLUMN "userId" DROP NOT NULL`,
  `ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'bug'`,
  `ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'site'`,
  `ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "telegramChatId" text`,
  `ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "telegramUsername" text`,
  `ALTER TABLE "bug_report" ADD COLUMN IF NOT EXISTS "telegramPhotoFileId" text`,
  `CREATE TABLE IF NOT EXISTS "telegram_bot_state" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
];

/**
 * Keep in sync with `website/drizzle/0017_founder_passport_wallet.sql`. A separate wallet
 * scored for Human Passport; anti-sybil via the unique index (also checked at the app layer
 * against every founder's walletAddress, see passport-wallet.ts).
 */
export const FOUNDER_PASSPORT_WALLET_SCHEMA_STATEMENTS = [
  `ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "passportWallet" text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "founder_passport_wallet_idx" ON "founder" ("passportWallet")`,
  `CREATE TABLE IF NOT EXISTS "founder_passport_nonce" (
  "code" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS "founder_passport_nonce_user_idx" ON "founder_passport_nonce" ("userId")`,
];

/**
 * Keep in sync with `website/drizzle/0018_wallet_vault_access_log.sql`. Audit recon.md R1:
 * durable (not in-memory) rate-limit + access-log trail for the wrap-key route. No key
 * material is stored, only who/when/outcome.
 */
export const WALLET_VAULT_ACCESS_LOG_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "wallet_vault_access_log" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "route" text NOT NULL,
  "outcome" text NOT NULL,
  "ip" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS "wallet_vault_access_log_user_idx" ON "wallet_vault_access_log" ("userId", "createdAt")`,
];

/**
 * Keep in sync with `website/drizzle/0019_factory_icon_usage.sql`. api-cron.md M2: durable
 * accounting for AI icon generation — one-shot payment consumption (unique paymentTxId),
 * per-day free/paid counters, and a generic fixed-window rate limiter.
 */
export const FACTORY_ICON_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "factory_icon_payment_tx" (
  "id" text PRIMARY KEY NOT NULL,
  "paymentTxId" text NOT NULL,
  "walletAddress" text NOT NULL,
  "dayKey" text NOT NULL,
  "claimedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "factory_icon_payment_tx_id_idx" ON "factory_icon_payment_tx" ("paymentTxId")`,
  `CREATE TABLE IF NOT EXISTS "factory_icon_daily_usage" (
  "dayKey" text NOT NULL,
  "walletAddress" text NOT NULL,
  "usedCount" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("dayKey", "walletAddress")
)`,
  `CREATE TABLE IF NOT EXISTS "api_rate_limit" (
  "bucketKey" text PRIMARY KEY NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "api_rate_limit_expires_idx" ON "api_rate_limit" ("expiresAt")`,
];

/**
 * Keep in sync with `website/drizzle/0020_sale_person_binding.sql`. PplCurveHubV2 needs a
 * private person key/public personId per account plus HMAC-only identifiers; no raw
 * wallet/nullifier/Telegram/phone value is stored in these tables.
 */
export const SALE_PERSON_BINDING_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "sale_person" (
  "personKey" text PRIMARY KEY NOT NULL,
  "personId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "sale_person_person_id_idx" ON "sale_person" ("personId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "sale_person_user_id_idx" ON "sale_person" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "sale_person_identifier" (
  "idHash" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "personKey" text NOT NULL REFERENCES "sale_person"("personKey") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS "sale_person_identifier_person_idx" ON "sale_person_identifier" ("personKey")`,
  `CREATE TABLE IF NOT EXISTS "sale_binding" (
  "personId" text PRIMARY KEY NOT NULL,
  "account" text NOT NULL,
  "chainId" integer NOT NULL,
  "hub" text NOT NULL,
  "nonce" text NOT NULL,
  "deadline" timestamp NOT NULL,
  "status" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "sale_binding_account_lower_idx" ON "sale_binding" (lower("account"))`,
];
