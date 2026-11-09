-- First-party visitor analytics (page views, sessions, custom funnel events).
-- Retention: `POST /api/cron/analytics-retention` (CRON_SECRET or admin) deletes rows older than 13 months by default.

CREATE TABLE IF NOT EXISTS "analytics_session" (
  "id" text PRIMARY KEY NOT NULL,
  "clientSessionId" text NOT NULL,
  "visitorId" text NOT NULL,
  "startedAt" timestamp NOT NULL,
  "lastSeenAt" timestamp NOT NULL,
  "durationSec" integer NOT NULL DEFAULT 0,
  "pageviewCount" integer NOT NULL DEFAULT 0,
  "isBounce" boolean NOT NULL DEFAULT true,
  "entryPath" text,
  "exitPath" text,
  "referrer" text,
  "utmSource" text,
  "utmMedium" text,
  "utmCampaign" text,
  "utmTerm" text,
  "utmContent" text,
  "refParam" text,
  "kolParam" text,
  "country" text,
  "region" text,
  "city" text,
  "browser" text,
  "os" text,
  "deviceType" text,
  "language" text,
  "timezone" text,
  "screenW" integer,
  "screenH" integer,
  "isBot" boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "analytics_session_started_idx" ON "analytics_session" ("startedAt");
CREATE INDEX IF NOT EXISTS "analytics_session_last_seen_idx" ON "analytics_session" ("lastSeenAt");
CREATE INDEX IF NOT EXISTS "analytics_session_visitor_started_idx" ON "analytics_session" ("visitorId", "startedAt");
CREATE INDEX IF NOT EXISTS "analytics_session_client_last_idx" ON "analytics_session" ("clientSessionId", "lastSeenAt");

CREATE TABLE IF NOT EXISTS "analytics_event" (
  "id" text PRIMARY KEY NOT NULL,
  "sessionId" text NOT NULL REFERENCES "analytics_session"("id") ON DELETE CASCADE,
  "visitorId" text NOT NULL,
  "eventType" text NOT NULL,
  "eventName" text,
  "path" text,
  "title" text,
  "props" jsonb NOT NULL DEFAULT '{}',
  "durationMs" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "isBot" boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "analytics_event_created_idx" ON "analytics_event" ("createdAt");
CREATE INDEX IF NOT EXISTS "analytics_event_type_created_idx" ON "analytics_event" ("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_event_path_created_idx" ON "analytics_event" ("path", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_event_path_pattern_idx" ON "analytics_event" ("path" text_pattern_ops);
CREATE INDEX IF NOT EXISTS "analytics_event_session_idx" ON "analytics_event" ("sessionId");
CREATE INDEX IF NOT EXISTS "analytics_event_name_created_idx" ON "analytics_event" ("eventName", "createdAt");
