// Test-only stand-in for `@/db`: an in-memory Postgres (PGlite) with the real bootstrap DDL.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  PARTNER_SCHEMA_STATEMENTS,
  FOUNDERS_SCHEMA_STATEMENTS,
  FOUNDERS_V2_SCHEMA_STATEMENTS,
  FOUNDER_REFERRAL_SCHEMA_STATEMENTS,
  FOUNDER_PUBLIC_PROFILE_SCHEMA_STATEMENTS,
  FOUNDER_PASSPORT_WALLET_SCHEMA_STATEMENTS,
  FOUNDER_QUEST_SCHEMA_STATEMENTS,
  BUG_REPORTS_SCHEMA_STATEMENTS,
} from "../../src/db/bootstrap-sql.mjs";
import * as schema from "../../src/db/schema.ts";

const client = new PGlite();
let ready = null;

export async function getDbReady() {
  if (!ready) {
    ready = (async () => {
      for (const group of [
        PARTNER_SCHEMA_STATEMENTS,
        FOUNDERS_SCHEMA_STATEMENTS,
        FOUNDERS_V2_SCHEMA_STATEMENTS,
        FOUNDER_REFERRAL_SCHEMA_STATEMENTS,
        FOUNDER_PUBLIC_PROFILE_SCHEMA_STATEMENTS,
        FOUNDER_PASSPORT_WALLET_SCHEMA_STATEMENTS,
        FOUNDER_QUEST_SCHEMA_STATEMENTS,
        BUG_REPORTS_SCHEMA_STATEMENTS,
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
