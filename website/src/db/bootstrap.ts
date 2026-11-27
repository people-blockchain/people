import postgres from "postgres";
import { buildBootstrapClientOptions, isRuntimeSchemaBootstrapDisabled } from "./config.ts";
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
  SUPPORT_CHAT_SCHEMA_STATEMENTS,
  FOUNDER_PASSPORT_WALLET_SCHEMA_STATEMENTS,
  WALLET_VAULT_ACCESS_LOG_SCHEMA_STATEMENTS,
  FACTORY_ICON_SCHEMA_STATEMENTS,
  ANALYTICS_SCHEMA_STATEMENTS,
  ANALYTICS_GA_INDEX_STATEMENTS,
  SALE_PERSON_BINDING_SCHEMA_STATEMENTS,
  FOUNDER_NFT_PERSON_SCHEMA_STATEMENTS,
  FOUNDER_NFT_AUTH_NONCE_SCHEMA_STATEMENTS,
  REFERRAL_KOL_SCHEMA_STATEMENTS,
  USER_TURNKEY_WALLET_SCHEMA_STATEMENTS,
  FOUNDER_SECURITY_AUDIT_SCHEMA_STATEMENTS,
} from "./bootstrap-sql.mjs";
import { UPLOAD_NONCE_SCHEMA_STATEMENTS } from "./upload-nonce-sql.mjs";
import { UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS } from "./upload-sign-rate-sql.mjs";

let bootstrapPromise: Promise<void> | null = null;

const SAFE_PG_ROLE_RE = /^[a-z_][a-z0-9_]{0,62}$/;

export interface SchemaBootstrapOptions {
  /** Override connection URL (used by deploy-time `npm run db:bootstrap` with owner creds). */
  url?: string;
  /** Optional least-privilege runtime role (e.g. `people_app`) to re-grant DML on `public`. */
  grantAppRole?: string;
}

export interface SchemaBootstrapResult {
  statementsApplied: number;
  grantedRole: string | null;
}

function schemaBootstrapUrl(overrideUrl?: string): string {
  const override = overrideUrl?.trim();
  const migrate = process.env.DATABASE_MIGRATE_URL?.trim();
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  const pooled = process.env.DATABASE_URL?.trim();
  const url = override || migrate || unpooled || pooled;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function validateAppRoleName(role: string): string {
  const trimmed = role.trim();
  if (!SAFE_PG_ROLE_RE.test(trimmed)) {
    throw new Error(`Invalid PostgreSQL role name: ${trimmed}`);
  }
  return trimmed;
}

export async function runPartnerSchemaBootstrap(
  options: SchemaBootstrapOptions = {},
): Promise<SchemaBootstrapResult> {
  const grantRole = options.grantAppRole ? validateAppRoleName(options.grantAppRole) : null;
  const client = postgres(schemaBootstrapUrl(options.url), buildBootstrapClientOptions());
  let statementsApplied = 0;
  try {
    for (const statement of PARTNER_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of DISCOVER_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of WALLET_VAULT_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of FOUNDERS_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0005_founders_verification.sql — applied here on first DB use (no manual migrate).
    for (const statement of FOUNDERS_V2_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of FOUNDERS_WORLD_ID_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of FOUNDER_DEMO_AIRDROP_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of FOUNDER_REFERRAL_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0014_founder_public_profile_opt_in.sql — opt-in flag for public founder lists.
    for (const statement of FOUNDER_PUBLIC_PROFILE_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of LAVKA_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0015_bug_reports.sql — bug bounty "beetle" button submissions.
    for (const statement of BUG_REPORTS_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0026_support_chat.sql — live support chat widget.
    for (const statement of SUPPORT_CHAT_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0017_founder_passport_wallet.sql — separate wallet for Human Passport scoring.
    for (const statement of FOUNDER_PASSPORT_WALLET_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0018_wallet_vault_access_log.sql — durable rate-limit/access log for wrap-key.
    for (const statement of WALLET_VAULT_ACCESS_LOG_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0019_factory_icon_usage.sql — durable icon-payment/quota/rate-limit tables.
    for (const statement of FACTORY_ICON_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0020_analytics.sql — first-party visitor analytics tables.
    for (const statement of ANALYTICS_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of ANALYTICS_GA_INDEX_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0020_sale_person_binding.sql — PplCurveHubV2 person + hashed identifiers.
    for (const statement of SALE_PERSON_BINDING_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0021_founder_nft_person.sql — Founder NFT personId + HP stamp-nullifier digests.
    for (const statement of FOUNDER_NFT_PERSON_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0022_founder_nft_auth_nonce.sql — single-use wallet signature nonce.
    for (const statement of FOUNDER_NFT_AUTH_NONCE_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0023_referral_kol_attribution.sql — KOL/referral attribution, sale purchases & commission ledger.
    for (const statement of REFERRAL_KOL_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0027_founding_traps_tg_claim_waitlist.sql is intentionally NOT auto-applied
    // here. Vercel Preview may share the production database; applying CREATE TABLE on
    // first preview hit would mutate prod without an explicit go-ahead. Apply 0027 via
    // migration after approval. Routes degrade on undefined_table / SQLSTATE 42P01 until then.
    // SQL also lives in bootstrap-sql.mjs for offline fixtures and tests only.
    // drizzle/0028_user_turnkey_wallet.sql — Turnkey sub-org + address (no private keys).
    for (const statement of USER_TURNKEY_WALLET_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    // drizzle/0029_security_audit_hardening.sql — passport wallet registry + World ID nonces.
    for (const statement of FOUNDER_SECURITY_AUDIT_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of UPLOAD_NONCE_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    for (const statement of UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS) {
      await client.unsafe(statement);
      statementsApplied += 1;
    }
    if (grantRole) {
      await client.unsafe(`GRANT USAGE ON SCHEMA public TO "${grantRole}"`);
      await client.unsafe(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${grantRole}"`,
      );
      await client.unsafe(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${grantRole}"`,
      );
    }
    return { statementsApplied, grantedRole: grantRole };
  } finally {
    await client.end({ timeout: 5 });
  }
}

/**
 * Idempotent DDL once per server instance; safe for concurrent awaiters.
 * No-op without DATABASE_URL or when `DB_SKIP_RUNTIME_BOOTSTRAP=true` (deploy-time migrations
 * + least-privilege `people_app` runtime role).
 */
export async function ensurePartnerSchema(): Promise<void> {
  if (isRuntimeSchemaBootstrapDisabled() || !process.env.DATABASE_URL?.trim()) {
    return;
  }
  if (!bootstrapPromise) {
    bootstrapPromise = runPartnerSchemaBootstrap()
      .then(() => undefined)
      .catch((error) => {
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
