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
