"use client";

import { parseUnits, type Address, type Hex } from "viem";

import type { ActiveEvmSigner } from "@/context/ExternalWalletContext";
import { BASE_USDC_ADDRESS } from "@/lib/sale/bridge";
import { createBasePublicClient, type BaseWriteSigner, writeOnBase } from "@/lib/sale/base-client";
import { saleContractAddress } from "@/lib/sale/config";
import { ERC20_ABI, PPL_CURVE_HUB_ABI } from "@/lib/sale/hub-abi";

export type BuyOnBaseErrorCode = "cooldown" | "dailyLimit" | "insufficient" | "rejected" | "generic";

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
  const client = createBasePublicClient();
  return client.readContract({
    address: BASE_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  });
}

export function usdToUsdc6(usd: number): bigint {
  return parseUnits(usd.toFixed(6), 6);
}

export function pplToMinOut(pplOut: number, slippageBps = 100): bigint {
  const scaled = Math.floor(pplOut * (1 - slippageBps / 10_000) * 1e18);
  return BigInt(Math.max(scaled, 0));
}

export function mapBuyError(err: unknown): BuyOnBaseErrorCode {
  const msg = String((err as { shortMessage?: string; message?: string })?.shortMessage ?? (err as Error)?.message ?? err).toLowerCase();
  if ((err as { code?: number })?.code === 4001 || msg.includes("user rejected") || msg.includes("denied")) {
    return "rejected";
  }
  if (msg.includes("cooldown")) return "cooldown";
  if (msg.includes("daily") || msg.includes("limit")) return "dailyLimit";
  if (msg.includes("insufficient") || msg.includes("exceeds balance") || msg.includes("transfer amount")) {
    return "insufficient";
  }
  return "generic";
}

export async function executeHubBuyWithUsdc(input: {
  writer: BaseWriteSigner;
  beneficiary: Address;
  usdAmount: number;
  minPplOut: bigint;
}): Promise<Hex> {
  const hub = saleContractAddress();
  if (!hub) throw new Error("sale_not_configured");

  const usdAmount6 = usdToUsdc6(input.usdAmount);
  const owner = input.writer.address;

  const client = createBasePublicClient();
  const allowance = await client.readContract({
    address: BASE_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, hub as Address],
  });

  if (allowance < usdAmount6) {
    await writeOnBase(input.writer, {
      address: BASE_USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [hub as Address, usdAmount6],
    });
  }

  return writeOnBase(input.writer, {
    address: hub as Address,
    abi: PPL_CURVE_HUB_ABI,
    functionName: "buyWith",
    args: [BASE_USDC_ADDRESS, input.beneficiary, usdAmount6, input.minPplOut],
  });
}

export async function waitForBaseReceipt(hash: Hex) {
  const client = createBasePublicClient();
  return client.waitForTransactionReceipt({ hash });
}
