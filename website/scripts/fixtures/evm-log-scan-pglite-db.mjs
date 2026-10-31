// Test-only stand-in for `@/db`: an in-memory Postgres (PGlite) with the real bootstrap DDL for
// the incremental log-scan cursor table.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { EVM_LOG_SCAN_CURSOR_SCHEMA_STATEMENTS } from "../../src/db/bootstrap-sql.mjs";
import * as schema from "../../src/db/schema.ts";

const client = new PGlite();
let ready = null;
let configured = true;

export async function getDbReady() {
  if (!ready) {
    ready = (async () => {
      for (const statement of EVM_LOG_SCAN_CURSOR_SCHEMA_STATEMENTS) await client.exec(statement);
      return drizzle(client, { schema });
    })();
  }
  return ready;
}

export function isDatabaseConfigured() {
  return configured;
}

export function setDatabaseConfiguredForTests(value) {
  configured = value;
}
