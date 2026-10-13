CREATE TABLE IF NOT EXISTS "founder_demo_token_airdrop" (
  "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "walletAddress" text NOT NULL,
  "grantedAt" timestamp NOT NULL DEFAULT now(),
  "txSummary" text
);

CREATE INDEX IF NOT EXISTS "founder_demo_token_airdrop_wallet_idx" ON "founder_demo_token_airdrop" ("walletAddress");
