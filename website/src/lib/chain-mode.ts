/** Which backend powers wallet, swap, factory, and explorer reads. */
export type PublicChainBackend = "people-node" | "cosmos-evm";

export function readPublicChainBackend(): PublicChainBackend {
  const raw = (process.env.NEXT_PUBLIC_CHAIN ?? "cosmos-evm").trim().toLowerCase();
  // Legacy env values still accepted as aliases for the legacy people-node stack.
  if (raw === "ovn-node" || raw === "legacy" || raw === "people-node") return "people-node";
  return "cosmos-evm";
}

export function isCosmosEvmChain(): boolean {
  return readPublicChainBackend() === "cosmos-evm";
}
