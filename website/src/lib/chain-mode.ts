/** Which backend powers wallet, swap, factory, and explorer reads. */
export type PublicChainBackend = "ovn-node" | "cosmos-evm";

export function readPublicChainBackend(): PublicChainBackend {
  const raw = (process.env.NEXT_PUBLIC_CHAIN ?? "cosmos-evm").trim().toLowerCase();
  if (raw === "ovn-node" || raw === "legacy" || raw === "people-node") return "ovn-node";
  return "cosmos-evm";
}

export function isCosmosEvmChain(): boolean {
  return readPublicChainBackend() === "cosmos-evm";
}
