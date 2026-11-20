-- Live support chat widget (signed-in users only): one thread per user, many messages.
CREATE TABLE IF NOT EXISTS "support_thread" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "user_email" text,
  "status" text NOT NULL DEFAULT 'open',
  "last_message_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_thread_user_idx" ON "support_thread" ("user_id");
CREATE INDEX IF NOT EXISTS "support_thread_status_idx" ON "support_thread" ("status", "last_message_at");
CREATE TABLE IF NOT EXISTS "support_message" (
  "id" text PRIMARY KEY NOT NULL,
  "thread_id" text NOT NULL REFERENCES "support_thread"("id") ON DELETE CASCADE,
  "sender_role" text NOT NULL,
  "sender_name" text,
  "body" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_message_thread_idx" ON "support_message" ("thread_id", "created_at");
