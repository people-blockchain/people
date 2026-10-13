-- Project feed (discover) — off-chain curation tables
CREATE TABLE IF NOT EXISTS "discover_project" (
  "id" text PRIMARY KEY NOT NULL,
  "authorUserId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "videoUri" text NOT NULL,
  "idea" text NOT NULL,
  "audience" text NOT NULL,
  "whyToken" text NOT NULL,
  "tokenAssetId" text NOT NULL,
  "tokenLink" text NOT NULL,
  "productUrl" text,
  "stageIndex" integer NOT NULL DEFAULT 0,
  "revision" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "weightedScore" double precision NOT NULL DEFAULT 0,
  "isSeed" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "discover_exposure" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId")
);

CREATE TABLE IF NOT EXISTS "discover_reaction" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "vote" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId", "revision")
);

CREATE TABLE IF NOT EXISTS "discover_follow" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId")
);

CREATE TABLE IF NOT EXISTS "discover_question" (
  "id" text PRIMARY KEY NOT NULL,
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "body" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "discover_product_click" (
  "id" text PRIMARY KEY NOT NULL,
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "discover_card_visit" (
  "projectId" text NOT NULL REFERENCES "discover_project"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "visitCount" integer NOT NULL DEFAULT 1,
  "firstAt" timestamp NOT NULL DEFAULT now(),
  "lastAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId")
);

CREATE TABLE IF NOT EXISTS "discover_site_visit" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "visitedAt" timestamp NOT NULL DEFAULT now()
);
