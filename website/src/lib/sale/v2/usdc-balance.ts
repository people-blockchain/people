"use client";

import { createPublicClient, erc20Abi, http, type Address } from "viem";

import { PPL_CURVE_HUB_V2_ABI } from "./abi";
import type { V2Chain } from "./logic";

function client(chain: V2Chain) {
  return createPublicClient({ chain: chain.chain, transport: http(undefined, { timeout: 12_000 }) });
}

/** On-chain USDC balance of `account` on the V2 chain; null when unknown. */
export async function readUsdcBalance(chain: V2Chain, account: Address): Promise<bigint | null> {
  if (!chain.usdcAddress) return null;
  try {
    return await client(chain).readContract({
      address: chain.usdcAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  } catch {
    return null;
  }
}

/**
 * Reads the balance until it rises above `before` (Base RPCs can lag the bridge by a few blocks).
 * Returns the last reading, which may still equal `before`.
 */
export async function waitForUsdcIncrease(
  chain: V2Chain,
  account: Address,
  before: bigint | null,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<bigint | null> {
  const attempts = opts.attempts ?? 8;
  const delayMs = opts.delayMs ?? 3_000;
  let last: bigint | null = null;
  for (let i = 0; i < attempts; i += 1) {
    last = await readUsdcBalance(chain, account);
    if (last !== null && before !== null && last > before) return last;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}

/** Whether the hub lets `router` buy for other recipients (`trustedRouter`). Null when unknown. */
export async function readTrustedRouter(chain: V2Chain, router: Address): Promise<boolean | null> {
  if (!chain.hubAddress) return null;
  try {
    return await client(chain).readContract({
      address: chain.hubAddress as Address,
      abi: PPL_CURVE_HUB_V2_ABI,
      functionName: "trustedRouter",
      args: [router],
    });
  } catch {
    return null;
  }
}
