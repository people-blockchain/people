/**
 * Sliding-window hits for direct-upload signing. Applied by runtime schema bootstrap.
 * `upload_sign_rate` stays so older databases keep their table. New hits go to
 * `upload_sign_rate_hit`. Keep column names aligned with `schema.ts`.
 */
export const UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "upload_sign_rate" (
  "bucketKey" text PRIMARY KEY NOT NULL,
  "count" integer NOT NULL,
  "expiresAt" timestamp NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "upload_sign_rate_expires_idx" ON "upload_sign_rate" ("expiresAt")`,
  `CREATE TABLE IF NOT EXISTS "upload_sign_rate_hit" (
  "id" text PRIMARY KEY NOT NULL,
  "subjectKey" text NOT NULL,
  "hitAt" timestamp NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "upload_sign_rate_hit_subject_idx" ON "upload_sign_rate_hit" ("subjectKey", "hitAt")`,
];
