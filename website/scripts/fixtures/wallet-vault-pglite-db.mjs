// Test-only stand-in for `@/db`: an in-memory Postgres (PGlite) with the real bootstrap DDL,
// scoped to the tables the wallet vault migration touches (M02-2).
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  PARTNER_SCHEMA_STATEMENTS,
  WALLET_VAULT_SCHEMA_STATEMENTS,
  WALLET_VAULT_ACCESS_LOG_SCHEMA_STATEMENTS,
} from "../../src/db/bootstrap-sql.mjs";
import * as schema from "../../src/db/schema.ts";

const client = new PGlite();
let ready = null;

export async function getDbReady() {
  if (!ready) {
    ready = (async () => {
      for (const group of [
        PARTNER_SCHEMA_STATEMENTS,
        WALLET_VAULT_SCHEMA_STATEMENTS,
        WALLET_VAULT_ACCESS_LOG_SCHEMA_STATEMENTS,
        // Same table as the factory-icon migration. Vault route tests talk to the durable
        // limiter, which upserts this table. Not a new migration.
        [
          `CREATE TABLE IF NOT EXISTS "api_rate_limit" (
  "bucketKey" text PRIMARY KEY NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp NOT NULL
)`,
          `CREATE INDEX IF NOT EXISTS "api_rate_limit_expires_idx" ON "api_rate_limit" ("expiresAt")`,
        ],
      ]) {
        for (const statement of group) await client.exec(statement);
      }
      return drizzle(client, { schema });
    })();
  }
  return ready;
}

export function isDatabaseConfigured() {
  return true;
}

/** Routes call this before reading the vault. The fixture already applied the DDL in getDbReady. */
export async function ensurePartnerSchema() {}
