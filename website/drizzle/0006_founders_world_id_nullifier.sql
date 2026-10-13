CREATE TABLE IF NOT EXISTS "founder_world_id_nullifier" (
  "nullifier" numeric(78, 0) NOT NULL,
  "action" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verifiedAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("nullifier", "action")
);

CREATE UNIQUE INDEX IF NOT EXISTS "founder_world_id_user_action_idx" ON "founder_world_id_nullifier" ("userId", "action");
