// Test `@/db`: the PGlite bug-reports database (which also carries the support-chat DDL),
// with a counter so tests can prove guests never reach the database.
import * as inner from "./bug-reports-pglite-db.mjs";

globalThis.__supportDbCalls = 0;

export async function getDbReady() {
  globalThis.__supportDbCalls += 1;
  return inner.getDbReady();
}

export function isDatabaseConfigured() {
  return true;
}
