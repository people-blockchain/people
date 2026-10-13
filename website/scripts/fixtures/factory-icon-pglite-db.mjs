// Test-only stand-in for `@/db`: an in-memory Postgres (PGlite) with the real bootstrap DDL for
// the M2 tables (icon payment txs, daily usage, durable rate limits).
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { FACTORY_ICON_SCHEMA_STATEMENTS } from "../../src/db/bootstrap-sql.mjs";
import * as schema from "../../src/db/schema.ts";

const client = new PGlite();
let ready = null;

export async function getDbReady() {
  if (!ready) {
    ready = (async () => {
      for (const statement of FACTORY_ICON_SCHEMA_STATEMENTS) await client.exec(statement);
      return drizzle(client, { schema });
    })();
  }
  return ready;
}

export function isDatabaseConfigured() {
  return true;
}
