export interface PostgresClientOptions {
  max: number;
  prepare: false;
  idle_timeout: number;
  connect_timeout: number;
  max_lifetime: number;
}

export interface BootstrapClientOptions {
  max: 1;
  prepare: false;
  idle_timeout: number;
  connect_timeout: number;
}

export function parsePositiveIntEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * When enabled (e.g. `DB_SKIP_RUNTIME_BOOTSTRAP=true` in production running under the
 * least-privilege `people_app` role), runtime requests skip idempotent DDL and rely on
 * deploy-time `npm run db:bootstrap`.
 */
export function isRuntimeSchemaBootstrapDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.DB_SKIP_RUNTIME_BOOTSTRAP?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export function buildPostgresClientOptions(
  env: NodeJS.ProcessEnv = process.env,
): PostgresClientOptions {
  return {
    max: parsePositiveIntEnv(env.DB_POOL_MAX, 5, 1, 20),
    prepare: false,
    idle_timeout: parsePositiveIntEnv(env.DB_IDLE_TIMEOUT_SEC, 20, 1, 300),
    connect_timeout: parsePositiveIntEnv(env.DB_CONNECT_TIMEOUT_SEC, 5, 1, 30),
    max_lifetime: parsePositiveIntEnv(env.DB_MAX_LIFETIME_SEC, 1800, 60, 86400),
  };
}

export function buildBootstrapClientOptions(
  env: NodeJS.ProcessEnv = process.env,
): BootstrapClientOptions {
  return {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: parsePositiveIntEnv(env.DB_BOOTSTRAP_CONNECT_TIMEOUT_SEC, 5, 1, 30),
  };
}

export function getHealthPingTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parsePositiveIntEnv(env.DB_HEALTH_TIMEOUT_MS, 2000, 200, 10000);
}
