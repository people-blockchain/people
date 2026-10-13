-- Optional video + screenshots on discover cards
ALTER TABLE "discover_project" ALTER COLUMN "videoUri" DROP NOT NULL;
ALTER TABLE "discover_project" ADD COLUMN IF NOT EXISTS "screenshotUris" text NOT NULL DEFAULT '[]';
ALTER TABLE "discover_project" ADD COLUMN IF NOT EXISTS "tokenIconUri" text;
