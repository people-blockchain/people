-- Provision a least-privilege runtime role (`people_app`) for the PEOPLE website on Neon.
--
-- Run as `neondb_owner` on the target branch (direct / non-pooler connection with verify-full).
-- Do NOT create this role through the Neon Console UI or default `neon roles create` without
-- `--access`, as Neon automatically adds Console/API-created roles to `neon_superuser`.
--
-- Before running, replace `<STRONG_RANDOM_PASSWORD>` with a freshly generated secret
-- (e.g. `openssl rand -base64 36 | tr -d '=+/' | head -c 40`) in your local session only.
-- Never commit a real password.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'people_app') THEN
    CREATE ROLE people_app
      LOGIN
      PASSWORD '<STRONG_RANDOM_PASSWORD>'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

-- Apply query/transaction safety timeouts at the role level (honored across Neon PgBouncer).
ALTER ROLE people_app SET statement_timeout = '10s';
ALTER ROLE people_app SET idle_in_transaction_session_timeout = '30s';

-- Defense-in-depth: prevent non-owners from creating objects in `public`.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Minimal database & schema access.
GRANT CONNECT ON DATABASE neondb TO people_app;
GRANT USAGE ON SCHEMA public TO people_app;

-- DML-only access on existing tables & sequences (no TRUNCATE, TRIGGER, REFERENCES, DDL).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO people_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO people_app;

-- Ensure tables/sequences created by future deploy-time migrations (`neondb_owner`) inherit grants.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO people_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO people_app;

COMMIT;
