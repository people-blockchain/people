import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensurePartnerSchema } from "./bootstrap";
import * as schema from "./schema";

export type PartnerDb = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let db: PartnerDb | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getDbSync(): PartnerDb {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!db) {
    client = postgres(url, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 });
    db = drizzle(client, { schema });
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
