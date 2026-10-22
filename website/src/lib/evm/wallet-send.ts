import { parseEther, type Hex } from "viem";
import { createEmbeddedWalletClient } from "@/lib/evm/client";
import { memoToData } from "@/lib/evm/memo";

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

/** Request handed to the wallet client: value transfer, plus the memo as calldata when present. */
export function buildNativeTransferRequest(input: { to: `0x${string}`; amountPpl: number; memo?: string }) {
  const data = memoToData(input.memo);
  return {
    to: input.to,
    value: parseEther(pplAmountToDecimalString(input.amountPpl)),
    ...(data ? { data } : {}),
  };
}

export async function sendNativeTransfer(input: {
  privateKey: Hex;
  to: `0x${string}`;
  amountPpl: number;
  /** Optional public payment memo, written on-chain as the transaction data. */
  memo?: string;
}): Promise<`0x${string}`> {
  const request = buildNativeTransferRequest(input);
  if (request.data) {
    // Calldata sent to a contract would run its fallback (and may revert or be misread),
    // so a memo is only attached to plain accounts.
    const { createBrowserPublicClient } = await import("@/lib/evm/client");
    const code = await createBrowserPublicClient().getCode({ address: input.to });
    if (code && code !== "0x") throw new Error("memo_contract");
  }
  const client = createEmbeddedWalletClient(input.privateKey);
  return client.sendTransaction(request);
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
