-- Single-use wallet signature nonce for Founder NFT mint and rebind.
-- The code is a random server nonce. No key material is stored.
CREATE TABLE IF NOT EXISTS "founder_nft_auth_nonce" (
  "code" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "chainId" integer NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "founder_nft_auth_nonce_user_idx" ON "founder_nft_auth_nonce" ("userId");
