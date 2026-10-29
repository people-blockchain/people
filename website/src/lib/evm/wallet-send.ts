import { parseEther, stringToHex, type Hex } from "viem";
import { transactionMemo } from "@/lib/evm/transaction-memo";
import { createEmbeddedWalletClient } from "@/lib/evm/client";
import { preflightAndSend } from "@/lib/evm/tx-preflight";

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

export function nativeTransferRequest(input: {
  to: `0x${string}`; amountPpl: number; memo?: string;
}) {
  const memo = input.memo;
  const data = memo ? stringToHex(memo) : undefined;
  if (memo && (memo.length > 256 || transactionMemo({ to: input.to, input: data }) !== memo)) {
    throw new Error("invalid_memo");
  }
  return { to: input.to, value: parseEther(pplAmountToDecimalString(input.amountPpl)),
    ...(data ? { data } : {}),
  };
}

export function calldataFloorGas(data: Hex): bigint {
  let zeroBytes = 0;
  let nonZeroBytes = 0;
  for (let i = 2; i < data.length; i += 2) {
    if (data.slice(i, i + 2) === "00") zeroBytes += 1;
    else nonZeroBytes += 1;
  }
  return BigInt(21000) + BigInt(10) * BigInt(zeroBytes + 4 * nonZeroBytes);
}

export async function sendNativeTransfer(input: {
  privateKey: Hex;
  to: `0x${string}`;
  amountPpl: number;
  memo?: string;
}): Promise<`0x${string}`> {
  const request = nativeTransferRequest(input);
  const client = createEmbeddedWalletClient(input.privateKey);
  const { createBrowserPublicClient } = await import("@/lib/evm/client");
  const publicClient = createBrowserPublicClient();
  if (request.data) {
    const code = await publicClient.getCode({ address: input.to });
    if (code && code !== "0x") throw new Error("memo_contract");
  }
  // Simulate + estimate before signing; gas is the estimate + 20%, never below the calldata floor.
  return preflightAndSend(
    publicClient,
    ({ gas }) => {
      const floor = request.data ? calldataFloorGas(request.data) : BigInt(0);
      return client.sendTransaction({ ...request, gas: gas > floor ? gas : floor });
    },
    { account: client.account.address, to: request.to, value: request.value, data: request.data },
  );
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
