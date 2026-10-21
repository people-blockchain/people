"use client";

import type { Address } from "viem";

import { BASE_USDC_ADDRESS } from "@/lib/sale/bridge";
import { createBasePublicClient } from "@/lib/sale/base-client";
import { saleContractAddress } from "@/lib/sale/config";
import { isSaleClosed } from "@/lib/sale/buy-math";
import { PPL_CURVE_HUB_ABI } from "@/lib/sale/hub-abi";

function hubAddress(): Address {
  const hub = saleContractAddress();
  if (!hub) throw new Error("sale_not_configured");
  return hub as Address;
}

export type HubQuote = { pplOut: bigint; usdUsed: bigint };

/** On-chain quote for spending `amount6` USDC (6 decimals) — the only price a purchase relies on. */
export async function readHubQuote(amount6: bigint): Promise<HubQuote> {
  const [pplOut, usdUsed] = await createBasePublicClient().readContract({
    address: hubAddress(),
    abi: PPL_CURVE_HUB_ABI,
    functionName: "quoteBuyWith",
    args: [BASE_USDC_ADDRESS, amount6],
  });
  return { pplOut, usdUsed };
}

export type HubSaleState = {
  openedAt: bigint;
  closesAt: bigint;
  finalized: boolean;
  soldOut: boolean;
  paused: boolean;
  sold: bigint;
  reserve: bigint;
  buyers: bigint;
  /** finalized || soldOut || past `closesAt` */
  closed: boolean;
};

/** Sale-wide state straight from the hub. */
export async function readHubSaleState(nowSec: number = Date.now() / 1000): Promise<HubSaleState> {
  const address = hubAddress();
  const abi = PPL_CURVE_HUB_ABI;
  const [openedAt, closesAt, finalized, soldOut, paused, sold, reserve, buyers] =
    await createBasePublicClient().multicall({
      allowFailure: false,
      contracts: [
        { address, abi, functionName: "openedAt" },
        { address, abi, functionName: "closesAt" },
        { address, abi, functionName: "finalized" },
        { address, abi, functionName: "soldOut" },
        { address, abi, functionName: "paused" },
        { address, abi, functionName: "sold" },
        { address, abi, functionName: "reserve" },
        { address, abi, functionName: "buyers" },
      ],
    });
  return {
    openedAt,
    closesAt,
    finalized,
    soldOut,
    paused,
    sold,
    reserve,
    buyers,
    closed: isSaleClosed({ finalized, soldOut, closesAt, nowSec }),
  };
}

export type HubBuyerLimits = {
  maxPerBuy6: bigint;
  /** Remaining daily allowance of the beneficiary. */
  remainingDaily6: bigint;
  /** Unix seconds when the payer may trade again (0 = now). */
  tradeAvailableAt: bigint;
};

/** Per-buyer limits: `payer` is the transaction sender, `beneficiary` receives PPL. */
export async function readHubBuyerLimits(payer: Address, beneficiary: Address): Promise<HubBuyerLimits> {
  const address = hubAddress();
  const abi = PPL_CURVE_HUB_ABI;
  const [maxPerBuy6, remainingDaily6, tradeAvailableAt] = await createBasePublicClient().multicall({
    allowFailure: false,
    contracts: [
      { address, abi, functionName: "maxPerBuyUsd6" },
      { address, abi, functionName: "remainingDailyUsd6", args: [beneficiary] },
      { address, abi, functionName: "tradeAvailableAt", args: [payer] },
    ],
  });
  return { maxPerBuy6, remainingDaily6, tradeAvailableAt };
}
