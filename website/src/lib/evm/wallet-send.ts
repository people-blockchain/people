import { parseEther, stringToHex, type Hex } from "viem";
import { transactionMemo } from "@/lib/evm/transaction-memo";
import { createEmbeddedWalletClient } from "@/lib/evm/client";
import { APPROVED_CONTRACT_GAS_PRICE_WEI } from "@/lib/factory-fees";

/** Simple native transfer with no calldata. */
export const NATIVE_TRANSFER_GAS_LIMIT = BigInt(21000);

/**
 * Headroom on gasLimit * gasPrice when a Max send reserves network fees.
 * 120/100 is +20%, in integer wei.
 */
export const MAX_SEND_GAS_BUFFER_NUMERATOR = BigInt(120);
export const MAX_SEND_GAS_BUFFER_DENOMINATOR = BigInt(100);

/** eth_gasPrice stand-in when the RPC call fails or returns zero. */
export const FALLBACK_GAS_PRICE_WEI = APPROVED_CONTRACT_GAS_PRICE_WEI;

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

function transferValueWei(input: { amountWei?: bigint; amountPpl?: number }): bigint {
  if (input.amountWei !== undefined) {
    if (input.amountWei <= BigInt(0)) throw new Error("invalid_amount");
    return input.amountWei;
  }
  return parseEther(pplAmountToDecimalString(input.amountPpl ?? Number.NaN));
}

export function nativeTransferRequest(input: {
  to: `0x${string}`; amountPpl?: number; amountWei?: bigint; memo?: string;
}) {
  const memo = input.memo;
  const data = memo ? stringToHex(memo) : undefined;
  if (memo && (memo.length > 256 || transactionMemo({ to: input.to, input: data }) !== memo)) {
    throw new Error("invalid_memo");
  }
  return { to: input.to, value: transferValueWei(input),
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
  return NATIVE_TRANSFER_GAS_LIMIT + BigInt(10) * BigInt(zeroBytes + 4 * nonZeroBytes);
}

/** 21000 for a plain transfer, or the calldata floor when a memo is attached. */
export function nativeSendGasLimit(memo?: string): bigint {
  if (!memo) return NATIVE_TRANSFER_GAS_LIMIT;
  return calldataFloorGas(stringToHex(memo));
}

/**
 * Spendable native amount and the fee both Max and the send form display.
 * feeWei = gasLimit * gasPrice * buffer + protocolFeeWei. maxWei clamps at 0.
 */
export function quoteMaxNativeSend(input: {
  balanceWei: bigint;
  gasPriceWei: bigint;
  gasLimit: bigint;
  protocolFeeWei?: bigint;
}): { feeWei: bigint; maxWei: bigint } {
  const gasPriceWei = input.gasPriceWei > BigInt(0) ? input.gasPriceWei : FALLBACK_GAS_PRICE_WEI;
  const gasLimit = input.gasLimit > BigInt(0) ? input.gasLimit : NATIVE_TRANSFER_GAS_LIMIT;
  const protocolFeeWei = input.protocolFeeWei !== undefined && input.protocolFeeWei > BigInt(0)
    ? input.protocolFeeWei
    : BigInt(0);
  const bufferedGasWei =
    (gasLimit * gasPriceWei * MAX_SEND_GAS_BUFFER_NUMERATOR) / MAX_SEND_GAS_BUFFER_DENOMINATOR;
  const feeWei = bufferedGasWei + protocolFeeWei;
  const balanceWei = input.balanceWei > BigInt(0) ? input.balanceWei : BigInt(0);
  const maxWei = balanceWei > feeWei ? balanceWei - feeWei : BigInt(0);
  return { feeWei, maxWei };
}

/** Live eth_gasPrice, or FALLBACK_GAS_PRICE_WEI when the RPC call cannot be used. */
export async function readNativeGasPriceWei(): Promise<bigint> {
  try {
    const { createBrowserPublicClient } = await import("@/lib/evm/client");
    const price = await createBrowserPublicClient().getGasPrice();
    if (price > BigInt(0)) return price;
  } catch {
    /* RPC unavailable. */
  }
  return FALLBACK_GAS_PRICE_WEI;
}

export async function sendNativeTransfer(input: {
  privateKey: Hex;
  to: `0x${string}`;
  amountPpl?: number;
  amountWei?: bigint;
  memo?: string;
}): Promise<`0x${string}`> {
  const request = nativeTransferRequest(input);
  const client = createEmbeddedWalletClient(input.privateKey);
  let transaction: { to: `0x${string}`; value: bigint; data?: Hex; gas?: bigint } =
    request;
  if (request.data) {
    const { createBrowserPublicClient } = await import("@/lib/evm/client");
    const publicClient = createBrowserPublicClient();
    const code = await publicClient.getCode({ address: input.to });
    if (code && code !== "0x") throw new Error("memo_contract");
    const estimate = await publicClient.estimateGas({
      account: client.account.address,
      to: request.to,
      value: request.value,
      data: request.data,
    });
    const floor = calldataFloorGas(request.data);
    transaction = { ...request, gas: estimate > floor ? estimate : floor };
  }
  const hash = await client.sendTransaction(transaction);
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
