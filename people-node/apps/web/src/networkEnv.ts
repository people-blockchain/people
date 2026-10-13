/** Honest network surface helpers for UI (devnet vs production). */

export type NetworkKind = "devnet" | "testnet" | "mainnet" | "unknown";

export function classifyNetwork(chainId: string | undefined | null): NetworkKind {
  if (!chainId) {
    return "unknown";
  }
  const id = chainId.toLowerCase();
  if (id.includes("mainnet") || id === "ovn") {
    return "mainnet";
  }
  if (id.includes("testnet")) {
    return "testnet";
  }
  if (id.includes("devnet") || id.includes("dev") || id.includes("local")) {
    return "devnet";
  }
  return "unknown";
}

export function isNonProductionNetwork(chainId: string | undefined | null): boolean {
  const kind = classifyNetwork(chainId);
  return kind === "devnet" || kind === "testnet" || kind === "unknown";
}

/** Faucet / bootstrap / demo price belong on non-mainnet only. */
export function showDevnetTools(chainId: string | undefined | null): boolean {
  return classifyNetwork(chainId) !== "mainnet";
}
