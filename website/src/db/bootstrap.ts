import postgres from "postgres";
import {
  PARTNER_SCHEMA_STATEMENTS,
  DISCOVER_SCHEMA_STATEMENTS,
  WALLET_VAULT_SCHEMA_STATEMENTS,
  FOUNDERS_SCHEMA_STATEMENTS,
  FOUNDERS_V2_SCHEMA_STATEMENTS,
  FOUNDERS_WORLD_ID_SCHEMA_STATEMENTS,
  FOUNDER_DEMO_AIRDROP_SCHEMA_STATEMENTS,
  FOUNDER_REFERRAL_SCHEMA_STATEMENTS,
  FOUNDER_PUBLIC_PROFILE_SCHEMA_STATEMENTS,
  LAVKA_SCHEMA_STATEMENTS,
  BUG_REPORTS_SCHEMA_STATEMENTS,
  FOUNDER_PASSPORT_WALLET_SCHEMA_STATEMENTS,
  WALLET_VAULT_ACCESS_LOG_SCHEMA_STATEMENTS,
  FACTORY_ICON_SCHEMA_STATEMENTS,
  TOKEN_ICON_SCHEMA_STATEMENTS,
  EVM_LOG_SCAN_CURSOR_SCHEMA_STATEMENTS,
  SALE_PERSON_BINDING_SCHEMA_STATEMENTS,
} from "./bootstrap-sql.mjs";

let bootstrapPromise: Promise<void> | null = null;

function schemaBootstrapUrl(): string {
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  const pooled = process.env.DATABASE_URL?.trim();
  const url = unpooled || pooled;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

async function runPartnerSchemaBootstrap(): Promise<void> {
  const client = postgres(schemaBootstrapUrl(), { max: 1, prepare: false, idle_timeout: 5 });
  try {
    for (const statement of PARTNER_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    for (const statement of DISCOVER_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    for (const statement of WALLET_VAULT_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    for (const statement of FOUNDERS_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // drizzle/0005_founders_verification.sql — applied here on first DB use (no manual migrate).
    for (const statement of FOUNDERS_V2_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    for (const statement of FOUNDERS_WORLD_ID_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    for (const statement of FOUNDER_DEMO_AIRDROP_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    for (const statement of FOUNDER_REFERRAL_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // drizzle/0014_founder_public_profile_opt_in.sql — opt-in flag for public founder lists.
    for (const statement of FOUNDER_PUBLIC_PROFILE_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    for (const statement of LAVKA_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // drizzle/0015_bug_reports.sql — bug bounty "beetle" button submissions.
    for (const statement of BUG_REPORTS_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // drizzle/0017_founder_passport_wallet.sql — separate wallet for Human Passport scoring.
    for (const statement of FOUNDER_PASSPORT_WALLET_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // drizzle/0018_wallet_vault_access_log.sql — durable rate-limit/access log for wrap-key.
    for (const statement of WALLET_VAULT_ACCESS_LOG_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // drizzle/0019_factory_icon_usage.sql — durable icon-payment/quota/rate-limit tables.
    for (const statement of FACTORY_ICON_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // Creator-signed token icon overrides (off-chain because only the factory may set metadataURI).
    for (const statement of TOKEN_ICON_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // Incremental eth_getLogs cursor for the token catalog (skips already-read immutable windows).
    for (const statement of EVM_LOG_SCAN_CURSOR_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
    // drizzle/0020_sale_person_binding.sql — PplCurveHubV2 person + hashed identifiers.
    for (const statement of SALE_PERSON_BINDING_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

/** Idempotent DDL once per server instance; safe for concurrent awaiters. No-op without DATABASE_URL. */
export async function ensurePartnerSchema(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    return;
  }
  if (!bootstrapPromise) {
    bootstrapPromise = runPartnerSchemaBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  await bootstrapPromise;
}

/** @internal test hook */
export function resetPartnerSchemaBootstrapForTests(): void {
  bootstrapPromise = null;
}
