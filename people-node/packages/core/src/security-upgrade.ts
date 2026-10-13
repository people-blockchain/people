import type { NetworkConfig } from "@ovn/protocol";

export const MAX_FUTURE_BLOCK_MS = 15_000;

export function readSecurityUpgrade(env: NodeJS.ProcessEnv): NetworkConfig["securityUpgrade"] {
  // An empty value counts as unset: docker-compose passes `${VAR:-}` as "" when the
  // operator has not scheduled an upgrade yet (M10-1 step 0).
  const heightRaw = env.SECURITY_UPGRADE_HEIGHT?.trim();
  const allowlistRaw = env.VALIDATOR_ALLOWLIST?.trim();
  if (!heightRaw) {
    if (allowlistRaw) throw new Error("VALIDATOR_ALLOWLIST requires SECURITY_UPGRADE_HEIGHT");
    return undefined;
  }
  if (!/^\d+$/.test(heightRaw)) throw new Error("Invalid SECURITY_UPGRADE_HEIGHT");
  const height = Number(heightRaw);
  if (!Number.isSafeInteger(height)) throw new Error("Invalid SECURITY_UPGRADE_HEIGHT");
  const validatorAllowlist = [...new Set((allowlistRaw ?? "").split(",").map(s => s.trim()).filter(Boolean))].sort();
  if (validatorAllowlist.some(address => !/^0x[0-9a-f]{40}$/.test(address))) throw new Error("Invalid VALIDATOR_ALLOWLIST");
  return { height, validatorAllowlist };
}

export function securityUpgradeActive(config: NetworkConfig, height: number): boolean {
  return !!config.securityUpgrade && height > 0 && height >= config.securityUpgrade.height;
}

export function legacyNetworkConfig(config: NetworkConfig): NetworkConfig {
  const { securityUpgrade: _upgrade, ...legacy } = config;
  return legacy;
}
