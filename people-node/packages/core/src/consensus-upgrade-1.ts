import type { NetworkConfig } from "@people/protocol";

/**
 * Coordinated activation height for the owner-approved small consensus items
 * (B10, M01-1/M03-5, M10-2, M10-4, M12-3, M12-4, M12-7, M13-5 part 3).
 * See docs/protocol-decisions/consensus-upgrade-1.md for the per-item decisions.
 */
export function readConsensusUpgrade1(env: NodeJS.ProcessEnv): NetworkConfig["consensusUpgrade1"] {
  const heightRaw = env.CONSENSUS_UPGRADE_1_HEIGHT?.trim();
  if (!heightRaw) {
    return undefined;
  }
  if (!/^\d+$/.test(heightRaw)) throw new Error("Invalid CONSENSUS_UPGRADE_1_HEIGHT");
  const height = Number(heightRaw);
  if (!Number.isSafeInteger(height)) throw new Error("Invalid CONSENSUS_UPGRADE_1_HEIGHT");
  return { height };
}

export function consensusUpgrade1Active(config: NetworkConfig, height: number): boolean {
  return !!config.consensusUpgrade1 && height > 0 && height >= config.consensusUpgrade1.height;
}

export function withoutConsensusUpgrade1(config: NetworkConfig): NetworkConfig {
  const { consensusUpgrade1: _upgrade, ...legacy } = config;
  return legacy;
}
