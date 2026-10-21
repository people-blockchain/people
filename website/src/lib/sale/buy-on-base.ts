"use client";

import { parseEther, parseUnits, type Address, type Hex } from "viem";

import type { ActiveEvmSigner } from "@/context/ExternalWalletContext";
import { BASE_USDC_ADDRESS } from "@/lib/sale/bridge";
import {
  createBasePublicClient,
  type BaseWriteSigner,
  writeOnBase,
  writeOnBaseAndWait,
} from "@/lib/sale/base-client";
import { BuyFlowError, DEFAULT_SLIPPAGE_BPS, minOutFromQuote, planBuyAmount } from "@/lib/sale/buy-math";
import { saleContractAddress } from "@/lib/sale/config";
import { ERC20_ABI, PPL_CURVE_HUB_ABI } from "@/lib/sale/hub-abi";
import { readHubBuyerLimits, readHubQuote, readHubSaleState } from "@/lib/sale/hub-quote";

export { mapBuyError, type BuyOnBaseErrorCode } from "@/lib/sale/buy-math";

/** Floor for the ETH a buyer needs on Base to pay for approve + buy. */
export const MIN_GAS_WEI = parseEther("0.00002");

/** Rough gas budget for approve + buyWith, used only for the balance pre-check. */
const GAS_UNITS_APPROVE = BigInt(70_000);
const GAS_UNITS_BUY = BigInt(400_000);

export function activeSignerToBaseWriter(signer: ActiveEvmSigner): BaseWriteSigner {
  if (signer.kind === "embedded" && signer.privateKey) {
    return { kind: "embedded", privateKey: signer.privateKey, address: signer.address };
  }
  if (!signer.provider) throw new Error("missing_provider");
  return {
    kind: "injected",
    provider: signer.provider!,
    address: signer.address,
  };
}

export function sessionToBaseWriter(session: {
  address: string;
  privateKey: string;
}): BaseWriteSigner {
  return {
    kind: "embedded",
    privateKey: session.privateKey,
    address: session.address as Address,
  };
}

export async function readBaseUsdcBalance(owner: Address): Promise<bigint> {
  return createBasePublicClient().readContract({
    address: BASE_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  });
}

export function usdToUsdc6(usd: number): bigint {
  return parseUnits(usd.toFixed(6), 6);
}

/**
 * Polls until the Base USDC balance is above `before` (the bridge paid out) or
 * the timeout passes; returns the latest balance either way.
 */
export async function waitForUsdcIncrease(
  owner: Address,
  before: bigint,
  timeoutMs = 45_000,
  intervalMs = 3_000,
): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  let balance = await readBaseUsdcBalance(owner);
  while (balance <= before && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    balance = await readBaseUsdcBalance(owner);
  }
  return balance;
}

export type HubBuyResult = {
  hash: Hex;
  /** USDC (6 decimals) spent on this purchase. */
  amount6: bigint;
  /** USDC (6 decimals) deliberately left in the wallet because of a limit. */
  leftover6: bigint;
  limitedBy: "requested" | "balance" | "perBuy" | "daily";
};

async function ensureGas(owner: Address, needsApprove: boolean): Promise<void> {
  const client = createBasePublicClient();
  const balance = await client.getBalance({ address: owner });
  let required = MIN_GAS_WEI;
  try {
    const gasPrice = await client.getGasPrice();
    const units = GAS_UNITS_BUY + (needsApprove ? GAS_UNITS_APPROVE : BigInt(0));
    const estimate = units * gasPrice * BigInt(2);
    if (estimate > required) required = estimate;
  } catch {
    /* keep the fixed floor */
  }
  if (balance < required) throw new BuyFlowError("noGas");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Buys PPL with Base USDC. The amount is min(wallet balance, requested, per-buy
 * cap, daily remainder); `minPplOut` comes from the hub's own `quoteBuyWith`
 * minus slippage; `buyWith` is simulated first so a revert surfaces as a named
 * contract error.
 */
export async function executeHubBuyWithUsdc(input: {
  writer: BaseWriteSigner;
  beneficiary: Address;
  usdAmount: number;
  slippageBps?: number;
}): Promise<HubBuyResult> {
  const hubRaw = saleContractAddress();
  if (!hubRaw) throw new Error("sale_not_configured");
  const hub = hubRaw as Address;
  const owner = input.writer.address;
  const client = createBasePublicClient();

  const state = await readHubSaleState();
  if (state.openedAt === BigInt(0)) throw new BuyFlowError("notOpen");
  if (state.paused) throw new BuyFlowError("paused");
  if (state.soldOut) throw new BuyFlowError("soldOut");
  if (state.closed) throw new BuyFlowError("closed");

  const [balance6, limits, head] = await Promise.all([
    readBaseUsdcBalance(owner),
    readHubBuyerLimits(owner, input.beneficiary),
    client.getBlock(),
  ]);

  // Compare against chain time, not the device clock: a skewed phone clock must not
  // block a buy the hub would accept (or let one through that it would reject).
  const nowSec = Number(head.timestamp);
  if (limits.tradeAvailableAt > BigInt(nowSec)) {
    throw new BuyFlowError("cooldown", Number(limits.tradeAvailableAt) - nowSec);
  }
  if (limits.remainingDaily6 === BigInt(0)) throw new BuyFlowError("dailyLimit");

  const plan = planBuyAmount({
    requested6: usdToUsdc6(input.usdAmount),
    balance6,
    maxPerBuy6: limits.maxPerBuy6,
    remainingDaily6: limits.remainingDaily6,
  });
  if (plan.amount6 === BigInt(0)) throw new BuyFlowError("insufficient");

  const quote = await readHubQuote(plan.amount6);
  if (quote.pplOut === BigInt(0) || quote.usdUsed === BigInt(0)) throw new BuyFlowError("soldOut");
  const minPplOut = minOutFromQuote(quote.pplOut, input.slippageBps ?? DEFAULT_SLIPPAGE_BPS);

  const allowance = await client.readContract({
    address: BASE_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, hub],
  });
  const needsApprove = allowance < quote.usdUsed;

  await ensureGas(owner, needsApprove);

  if (needsApprove) {
    await writeOnBaseAndWait(input.writer, {
      address: BASE_USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [hub, quote.usdUsed],
    });
  }

  const buyArgs = [BASE_USDC_ADDRESS, input.beneficiary, plan.amount6, minPplOut] as const;
  // A load-balanced RPC may not have seen the approval yet; retry the simulation briefly.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client.simulateContract({
        account: owner,
        address: hub,
        abi: PPL_CURVE_HUB_ABI,
        functionName: "buyWith",
        args: buyArgs,
      });
      break;
    } catch (err) {
      if (!needsApprove || attempt >= 2) throw err;
      await sleep(1_500);
    }
  }

  const hash = await writeOnBase(input.writer, {
    address: hub,
    abi: PPL_CURVE_HUB_ABI,
    functionName: "buyWith",
    args: buyArgs,
  });

  return { hash, amount6: plan.amount6, leftover6: plan.leftover6, limitedBy: plan.limitedBy };
}

export async function waitForBaseReceipt(hash: Hex) {
  return createBasePublicClient().waitForTransactionReceipt({ hash });
}
