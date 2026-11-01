import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { UPLOAD_NONCE_SCHEMA_STATEMENTS } from "../../src/db/upload-nonce-sql.mjs";
import { UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS } from "../../src/db/upload-sign-rate-sql.mjs";
import * as schema from "../../src/db/schema.ts";

const client = new PGlite();
let ready = null;

export async function getDbReady() {
  if (!ready) {
    ready = (async () => {
      for (const statement of UPLOAD_NONCE_SCHEMA_STATEMENTS) await client.exec(statement);
      for (const statement of UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS) await client.exec(statement);
      return drizzle(client, { schema });
    })();
  }
  return ready;
}

export function isDatabaseConfigured() {
  return true;
}
