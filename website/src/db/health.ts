import { getHealthPingTimeoutMs } from "./config";
import { getSqlClient, isDatabaseConfigured } from "./index";

export type DatabaseHealthResult =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: "unconfigured" | "timeout" | "unavailable" };

export interface DatabaseHealthDeps {
  isConfigured?: () => boolean;
  ping?: () => Promise<void>;
  timeoutMs?: number;
  now?: () => number;
  onError?: (err: unknown) => void;
}

let inFlightHealthCheck: Promise<DatabaseHealthResult> | null = null;

function defaultPing(): Promise<void> {
  const sql = getSqlClient();
  return sql`SELECT 1`.then(() => undefined);
}

function logSanitizedHealthError(err: unknown): void {
  if (err && typeof err === "object") {
    const record = err as { code?: unknown; name?: unknown };
    const code = typeof record.code === "string" ? record.code : undefined;
    const name = typeof record.name === "string" ? record.name : "Error";
    console.error("[health] database probe failed", { name, code: code ?? "unknown" });
    return;
  }
  console.error("[health] database probe failed");
}

async function runHealthProbe(deps: DatabaseHealthDeps): Promise<DatabaseHealthResult> {
  const isConfigured = deps.isConfigured ?? isDatabaseConfigured;
  if (!isConfigured()) {
    return { ok: false, reason: "unconfigured" };
  }

  const ping = deps.ping ?? defaultPing;
  const timeoutMs = deps.timeoutMs ?? getHealthPingTimeoutMs();
  const now = deps.now ?? Date.now;
  const onError = deps.onError ?? logSanitizedHealthError;

  const startedAt = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error("health_ping_timeout");

  try {
    await Promise.race([
      ping(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Math.max(0, Math.round(now() - startedAt)) };
  } catch (err) {
    if (err === timeoutError) {
      onError(err);
      return { ok: false, reason: "timeout" };
    }
    onError(err);
    return { ok: false, reason: "unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Lightweight DB liveness/readiness probe (`SELECT 1` with strict timeout).
 * Does not invoke runtime DDL (`ensurePartnerSchema`) and coalesces concurrent
 * default probes so probe storms cannot amplify load on Neon.
 */
export async function checkDatabaseHealth(
  deps?: DatabaseHealthDeps,
): Promise<DatabaseHealthResult> {
  if (deps) {
    return runHealthProbe(deps);
  }
  if (!inFlightHealthCheck) {
    inFlightHealthCheck = runHealthProbe({}).finally(() => {
      inFlightHealthCheck = null;
    });
  }
  return inFlightHealthCheck;
}

/** @internal test hook */
export function resetHealthProbeForTests(): void {
  inFlightHealthCheck = null;
}
