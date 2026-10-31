/**
 * One-time direct-upload nonces. Applied by runtime schema bootstrap (no manual migrate).
 * Keep column names aligned with `uploadNonces` in `schema.ts`.
 */
export const UPLOAD_NONCE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "upload_nonce" (
  "nonce" text PRIMARY KEY NOT NULL,
  "address" text NOT NULL,
  "domain" text NOT NULL,
  "expiry" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "consumedAt" timestamp
)`,
  `CREATE INDEX IF NOT EXISTS "upload_nonce_expires_idx" ON "upload_nonce" ("expiresAt")`,
];
