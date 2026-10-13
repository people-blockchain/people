// Test-only stand-in for `@/db`: an in-memory Postgres (PGlite) with the real bootstrap DDL,
// used to exercise authorizeWeb3AuthIdToken's user/account binding logic end to end.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PARTNER_SCHEMA_STATEMENTS, WALLET_VAULT_SCHEMA_STATEMENTS } from "../../src/db/bootstrap-sql.mjs";
import * as schema from "../../src/db/schema.ts";

const client = new PGlite();
let ready = null;

export async function getDbReady() {
  if (!ready) {
    ready = (async () => {
      for (const group of [PARTNER_SCHEMA_STATEMENTS, WALLET_VAULT_SCHEMA_STATEMENTS]) {
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
