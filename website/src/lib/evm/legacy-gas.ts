import { createPublicClient, http, parseGwei, type Chain } from "viem";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { peopleEvmChain } from "@/lib/evm/config";

const MIN_GAS_PRICE = parseGwei("1");

export function evmPublicClient(chain?: Chain) {
  const rpc = readEvmRpcUrl();
  const c = chain ?? { ...peopleEvmChain, rpcUrls: { default: { http: [rpc] } } };
  return createPublicClient({ chain: c, transport: http(rpc) });
}

export async function legacyGasOverrides(publicClient: ReturnType<typeof evmPublicClient>) {
  let gasPrice = await publicClient.getGasPrice().catch(() => MIN_GAS_PRICE);
  if (!gasPrice || gasPrice < MIN_GAS_PRICE) gasPrice = MIN_GAS_PRICE;
  return { type: "legacy" as const, gasPrice: (gasPrice * BigInt(125)) / BigInt(100) };
}

export async function estimateGasMargin(
  publicClient: ReturnType<typeof evmPublicClient>,
  estimate: () => Promise<bigint>,
  fallback = BigInt(120_000),
) {
  try {
    const est = await estimate();
    if (est > BigInt(0)) return (est * BigInt(130)) / BigInt(100);
  } catch {
    /* fallback */
  }
  return fallback;
}

export type LegacyWriteOpts = {
  gas?: bigint;
};
