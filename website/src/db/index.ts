import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensurePartnerSchema } from "./bootstrap";
import { buildPostgresClientOptions } from "./config";
import * as schema from "./schema";

export type PartnerDb = PostgresJsDatabase<typeof schema>;
export type PartnerSqlClient = ReturnType<typeof postgres>;

let client: PartnerSqlClient | null = null;
let db: PartnerDb | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Shared pooled postgres.js client; does NOT trigger runtime schema bootstrap. */
export function getSqlClient(): PartnerSqlClient {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!client) {
    client = postgres(url, buildPostgresClientOptions());
  }
  return client;
}

function getDbSync(): PartnerDb {
  const sqlClient = getSqlClient();
  if (!db) {
    db = drizzle(sqlClient, { schema });
  }
  return db;
}

/** Lazy Drizzle handle; runs idempotent schema bootstrap on first use (runtime only). */
export async function getDbReady(): Promise<PartnerDb> {
  await ensurePartnerSchema();
  return getDbSync();
}

/** @deprecated Prefer getDbReady(); kept for DrizzleAdapter wiring after bootstrap. */
export function getDb(): PartnerDb {
  return getDbSync();
}

export { ensurePartnerSchema, schema };
