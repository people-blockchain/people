-- Bug bounty "beetle" button: user-submitted reports with optional client-captured
-- screenshot, auto-context, and admin triage (status/severity/reward).
CREATE TABLE IF NOT EXISTS "bug_report" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "screenshotData" text,
  "context" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'new',
  "severity" text,
  "rewardPoints" integer NOT NULL DEFAULT 0,
  "adminNote" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "bug_report_user_idx" ON "bug_report" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "bug_report_status_idx" ON "bug_report" ("status", "createdAt");
