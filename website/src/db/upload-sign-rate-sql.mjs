/**
 * Per-client counters for direct-upload signing. Applied by runtime schema bootstrap.
 * Keep column names aligned with `uploadSignRates` in `schema.ts`.
 */
export const UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "upload_sign_rate" (
  "bucketKey" text PRIMARY KEY NOT NULL,
  "count" integer NOT NULL,
  "expiresAt" timestamp NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "upload_sign_rate_expires_idx" ON "upload_sign_rate" ("expiresAt")`,
];
