-- Founder NFT personId registry (docs/founder-nft.md). Additive only.
-- One opaque personId per human; sha256 digests of Human Passport stamp nullifiers map to it.
-- No wallet address, raw nullifier or other PII is stored.
CREATE TABLE IF NOT EXISTS "founder_nft_person" (
  "personId" text PRIMARY KEY NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "founder_nft_stamp_hash" (
  "stampHash" text PRIMARY KEY NOT NULL,
  "personId" text NOT NULL REFERENCES "founder_nft_person"("personId") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "founder_nft_stamp_hash_person_idx" ON "founder_nft_stamp_hash" ("personId");
