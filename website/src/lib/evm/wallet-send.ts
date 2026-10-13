import { parseEther, type Hex } from "viem";
import { createEmbeddedWalletClient } from "@/lib/evm/client";

/**
 * Decimal string without exponent notation. `String(1e-7)` yields "1e-7", which
 * `parseEther` rejects, so format to fixed decimals and fail on out-of-range numbers.
 */
export function pplAmountToDecimalString(amount: number, decimals = 18): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
  let fixed: string;
  try {
    fixed = amount.toFixed(decimals);
  } catch {
    // toFixed throws for magnitudes >= 1e21.
    throw new Error("invalid_amount");
  }
  if (fixed.includes("e") || fixed.includes("E")) throw new Error("invalid_amount");
  return fixed;
}

export async function sendNativeTransfer(input: {
  privateKey: Hex;
  to: `0x${string}`;
  amountPpl: number;
}): Promise<`0x${string}`> {
  const client = createEmbeddedWalletClient(input.privateKey);
  const hash = await client.sendTransaction({
    to: input.to,
    value: parseEther(pplAmountToDecimalString(input.amountPpl)),
  });
  return hash;
}

export async function waitForReceipt(hash: `0x${string}`, timeoutMs = 60_000): Promise<boolean> {
  const { createBrowserPublicClient } = await import("@/lib/evm/client");
  const publicClient = createBrowserPublicClient();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return receipt.status === "success";
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
