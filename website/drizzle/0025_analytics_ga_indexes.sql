-- GA-style dashboard query indexes (sessions/events at scale).

CREATE INDEX IF NOT EXISTS "analytics_session_bot_started_idx"
  ON "analytics_session" ("startedAt")
  WHERE "isBot" = false;

CREATE INDEX IF NOT EXISTS "analytics_session_country_started_idx"
  ON "analytics_session" ("country", "startedAt")
  WHERE "isBot" = false;

CREATE INDEX IF NOT EXISTS "analytics_session_region_started_idx"
  ON "analytics_session" ("region", "startedAt")
  WHERE "isBot" = false;

CREATE INDEX IF NOT EXISTS "analytics_event_bot_created_idx"
  ON "analytics_event" ("createdAt")
  WHERE "isBot" = false;

CREATE INDEX IF NOT EXISTS "analytics_event_session_created_idx"
  ON "analytics_event" ("sessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "analytics_event_visitor_created_idx"
  ON "analytics_event" ("visitorId", "createdAt");

CREATE INDEX IF NOT EXISTS "analytics_event_type_name_created_idx"
  ON "analytics_event" ("eventType", "eventName", "createdAt");
