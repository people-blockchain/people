-- Contract origin: ppl-v2 contracts/src/sale/PplCurveHubV2.sol.
-- Additive only: one private person per signed-in account, hashed identifiers that map to it,
-- and the latest verifier attestation issued for an account. No existing table is altered.
CREATE TABLE IF NOT EXISTS "sale_person" (
  "personKey" text PRIMARY KEY NOT NULL,
  "personId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "sale_person_person_id_idx" ON "sale_person" ("personId");
CREATE UNIQUE INDEX IF NOT EXISTS "sale_person_user_id_idx" ON "sale_person" ("userId");

CREATE TABLE IF NOT EXISTS "sale_person_identifier" (
  "idHash" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "personKey" text NOT NULL REFERENCES "sale_person"("personKey") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sale_person_identifier_person_idx" ON "sale_person_identifier" ("personKey");

CREATE TABLE IF NOT EXISTS "sale_binding" (
  "personId" text PRIMARY KEY NOT NULL,
  "account" text NOT NULL,
  "chainId" integer NOT NULL,
  "hub" text NOT NULL,
  "nonce" text NOT NULL,
  "deadline" timestamp NOT NULL,
  "status" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "sale_binding_account_lower_idx" ON "sale_binding" (lower("account"));
