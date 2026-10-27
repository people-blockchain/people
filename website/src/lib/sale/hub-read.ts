/**
 * On-chain reads for `PplCurveHub` on Base (sale curve hub).
 *
 * Used by the `/buy` chain adapter. Fail closed: RPC or decode errors yield
 * `openedAt = null` so the UI never presents the sale as live.
 */

import { createPublicClient, formatUnits, http, type Address } from "viem";
import { base } from "viem/chains";

import { SALE_HUB_CHAIN, saleContractAddress } from "./config";

/** Minimal ABI for hub state + buy quotes (matches Sourcify-verified PplCurveHub). */
export const PPL_CURVE_HUB_ABI = [
  {
    type: "function",
    name: "openedAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "graduated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "closesAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "soldPpl",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "raisedUsd6",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Base mainnet USDC — default stable for hub `quoteBuy` previews on `/buy`. */
export const HUB_QUOTE_USDC_BASE: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export type HubSaleSnapshot = {
  openedAt: bigint;
  isActive: boolean;
  paused: boolean;
  graduated: boolean;
  closesAt: bigint;
  soldPplWei: bigint;
  raisedUsd6: bigint;
};

export function saleHubPublicClient(rpcUrl?: string) {
  const url = (rpcUrl ?? SALE_HUB_CHAIN.rpcUrl).trim();
  return createPublicClient({
    chain: base,
    transport: http(url, { timeout: 12_000 }),
  });
}

/** Raw hub state. Returns `null` on any read failure (fail closed). */
export async function readHubSaleSnapshot(
  contractAddress: Address,
  client?: ReturnType<typeof saleHubPublicClient>,
): Promise<HubSaleSnapshot | null> {
  const c = client ?? saleHubPublicClient();
  try {
    const [openedAt, isActive, paused, graduated, closesAt, soldPplWei, raisedUsd6] =
      await c.multicall({
        contracts: [
          { address: contractAddress, abi: PPL_CURVE_HUB_ABI, functionName: "openedAt" },
          { address: contractAddress, abi: PPL_CURVE_HUB_ABI, functionName: "isActive" },
          { address: contractAddress, abi: PPL_CURVE_HUB_ABI, functionName: "paused" },
          { address: contractAddress, abi: PPL_CURVE_HUB_ABI, functionName: "graduated" },
          { address: contractAddress, abi: PPL_CURVE_HUB_ABI, functionName: "closesAt" },
          { address: contractAddress, abi: PPL_CURVE_HUB_ABI, functionName: "soldPpl" },
          { address: contractAddress, abi: PPL_CURVE_HUB_ABI, functionName: "raisedUsd6" },
        ],
        allowFailure: false,
      });
    return {
      openedAt,
      isActive,
      paused,
      graduated,
      closesAt,
      soldPplWei,
      raisedUsd6,
    };
  } catch {
    return null;
  }
}

export function hubSoldPplHuman(soldPplWei: bigint): number {
  const n = Number.parseFloat(formatUnits(soldPplWei, 18));
  return Number.isFinite(n) ? n : 0;
}

export function hubRaisedUsd(raisedUsd6: bigint): number {
  const n = Number.parseFloat(formatUnits(raisedUsd6, 6));
  return Number.isFinite(n) ? n : 0;
}

/** Hub `quoteBuy` for a USD amount (6-decimal stable input). Returns PPL out, human units. */
export async function hubQuotePplOut(
  contractAddress: Address,
  usdAmount: number,
  client?: ReturnType<typeof saleHubPublicClient>,
  stableToken: Address = HUB_QUOTE_USDC_BASE,
): Promise<number | null> {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) return null;
  const amountIn = BigInt(Math.round(usdAmount * 1_000_000));
  const c = client ?? saleHubPublicClient();
  try {
    const pplOutWei = await c.readContract({
      address: contractAddress,
      abi: PPL_CURVE_HUB_ABI,
      functionName: "quoteBuy",
      args: [stableToken, amountIn],
    });
    const ppl = Number.parseFloat(formatUnits(pplOutWei, 18));
    return Number.isFinite(ppl) && ppl > 0 ? ppl : null;
  } catch {
    return null;
  }
}

export type HubGateStatus = "not_open" | "open" | "paused" | "graduated" | "ended" | "unavailable";

/** Maps hub getters to a purchase gate. `openedAt == 0` means the owner has not called `open()`. */
export function hubGateStatus(snapshot: HubSaleSnapshot | null, nowSec = Math.floor(Date.now() / 1000)): HubGateStatus {
  if (!snapshot) return "unavailable";
  if (snapshot.openedAt === BigInt(0)) return "not_open";
  if (snapshot.graduated) return "graduated";
  if (snapshot.paused) return "paused";
  if (snapshot.closesAt > BigInt(0) && nowSec >= Number(snapshot.closesAt)) return "ended";
  if (snapshot.isActive) return "open";
  return "paused";
}

export function hubAddressConfigured(): Address | null {
  const raw = saleContractAddress();
  return raw ? (raw as Address) : null;
}
