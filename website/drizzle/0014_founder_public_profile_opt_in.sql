-- Transparency page: public founder lists (top ambassadors, founder lookup) may show a
-- name/avatar only for founders who explicitly opted in. Default false, so nothing is
-- published implicitly and existing rows stay private.
ALTER TABLE "founder" ADD COLUMN IF NOT EXISTS "publicProfileOptIn" boolean NOT NULL DEFAULT false;
