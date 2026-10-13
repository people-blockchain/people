export type ReadinessStatus = "ok" | "warn" | "fail" | "unknown";

export interface ReadinessCheck {
  id: string;
  status: ReadinessStatus;
  detail?: string;
}

export interface ReadinessInput {
  online: boolean;
  peerCount?: number;
  finalizedLag?: number;
  headHeight?: number;
  version?: string;
  hasKey: boolean;
  stake?: number;
  minStake: number;
  freeDiskBytes?: number;
  quotaBytes?: number;
}

const MIN_PEERS = 1;
const MAX_LAG_WARN = 5;
const MAX_LAG_FAIL = 50;
const MIN_FREE_BYTES = 50 * 1024 * 1024;

export function buildNodeReadiness(input: ReadinessInput): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [
    {
      id: "internet",
      status: input.online ? "ok" : "fail",
      detail: input.online ? "online" : "offline"
    },
    {
      id: "peers",
      status:
        input.peerCount === undefined
          ? "unknown"
          : input.peerCount >= MIN_PEERS
            ? "ok"
            : "warn",
      detail: input.peerCount === undefined ? undefined : String(input.peerCount)
    },
    {
      id: "sync",
      status:
        input.finalizedLag === undefined
          ? "unknown"
          : input.finalizedLag <= MAX_LAG_WARN
            ? "ok"
            : input.finalizedLag <= MAX_LAG_FAIL
              ? "warn"
              : "fail",
      detail:
        input.finalizedLag === undefined
          ? undefined
          : `lag ${input.finalizedLag}${input.headHeight !== undefined ? ` · head ${input.headHeight}` : ""}`
    },
    {
      id: "version",
      status: input.version ? "ok" : "unknown",
      detail: input.version
    },
    {
      id: "disk",
      status:
        input.freeDiskBytes === undefined
          ? "unknown"
          : input.freeDiskBytes >= MIN_FREE_BYTES
            ? "ok"
            : "warn",
      detail:
        input.freeDiskBytes === undefined
          ? undefined
          : formatBytes(input.freeDiskBytes) +
            (input.quotaBytes ? ` / ${formatBytes(input.quotaBytes)}` : "")
    },
    {
      id: "key",
      status: input.hasKey ? "ok" : "fail"
    },
    {
      id: "stake",
      status:
        input.stake === undefined
          ? "unknown"
          : input.stake >= input.minStake
            ? "ok"
            : "fail",
      detail:
        input.stake === undefined
          ? undefined
          : `${input.stake.toFixed(2)} / min ${input.minStake}`
    }
  ];
  return checks;
}

export function readinessOverall(checks: ReadinessCheck[]): ReadinessStatus {
  if (checks.some((item) => item.status === "fail")) {
    return "fail";
  }
  if (checks.some((item) => item.status === "warn")) {
    return "warn";
  }
  if (checks.every((item) => item.status === "ok")) {
    return "ok";
  }
  return "unknown";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function probeBrowserStorage(): Promise<{ freeDiskBytes?: number; quotaBytes?: number }> {
  try {
    if (!navigator.storage?.estimate) {
      return {};
    }
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota;
    const usage = estimate.usage;
    if (quota === undefined) {
      return {};
    }
    return {
      quotaBytes: quota,
      freeDiskBytes: Math.max(0, quota - (usage ?? 0))
    };
  } catch {
    return {};
  }
}
