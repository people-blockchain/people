import { formatUnits, getAddress, isAddress, parseAbi, parseEther, parseUnits, stringToHex, type Address, type Hex } from "viem";
import { transactionMemo } from "@/lib/evm/transaction-memo";
import { createEmbeddedWalletClient } from "@/lib/evm/client";
import { preflightAndSend, type PreflightClient } from "@/lib/evm/tx-preflight";
import { preflightWriteContract } from "@/lib/evm/preflight-write";
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

/* ------------------------------------------------------------------------------------------------
 * ERC-20 and NFT transfers. Both go through the shared preflight (simulate + estimate, so a doomed
 * call is never signed), then wait for the receipt: a mined-but-reverted transaction is an error,
 * never a success.
 * ---------------------------------------------------------------------------------------------- */

export const erc20TransferAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export const nftTransferAbi = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

/** Failure codes the wallet maps to localized copy (the message is the code itself). */
export type WalletSendErrorCode =
  | "insufficient_token_balance"
  | "not_nft_owner"
  | "tx_reverted"
  | "tx_timeout"
  | "tx_replaced"
  | "invalid_address"
  | "invalid_amount";

export class WalletSendError extends Error {
  readonly code: WalletSendErrorCode;
  readonly hash?: Hex;

  constructor(code: WalletSendErrorCode, hash?: Hex) {
    super(code);
    this.name = "WalletSendError";
    this.code = code;
    this.hash = hash;
  }
}

export type SendStage = "sending" | "confirming";

/** The slice of a viem public client the transfers use; tests pass a mock. */
export type TransferPublicClient = PreflightClient & {
  readContract(args: never): Promise<unknown>;
  waitForTransactionReceipt(args: never): Promise<{ status: string }>;
};

/** The slice of a viem wallet client the transfers use. */
export type TransferWalletClient = {
  account: { address: Address };
  writeContract(args: never): Promise<Hex>;
};

export type TransferClients = { publicClient: TransferPublicClient; walletClient: TransferWalletClient };

async function defaultClients(privateKey: Hex): Promise<TransferClients> {
  const walletClient = createEmbeddedWalletClient(privateKey);
  const { createBrowserPublicClient } = await import("@/lib/evm/client");
  return {
    publicClient: createBrowserPublicClient() as unknown as TransferPublicClient,
    walletClient: walletClient as unknown as TransferWalletClient,
  };
}

export function erc20TransferArgs(to: string, amountUnits: bigint): readonly [Address, bigint] {
  if (!isAddress(to)) throw new WalletSendError("invalid_address");
  if (amountUnits <= BigInt(0)) throw new WalletSendError("invalid_amount");
  return [getAddress(to), amountUnits];
}

export function nftTransferArgs(from: string, to: string, tokenId: bigint): readonly [Address, Address, bigint] {
  if (!isAddress(from) || !isAddress(to)) throw new WalletSendError("invalid_address");
  if (tokenId < BigInt(0)) throw new WalletSendError("invalid_amount");
  return [getAddress(from), getAddress(to), tokenId];
}

/**
 * Typed amount -> base units, decimals-aware and exact (no float math). Throws "amount" (not a
 * positive number), "precision" (more fraction digits than the token has) or "asset" (decimals
 * unknown).
 */
export function parseTokenAmount(input: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("asset");
  const text = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("amount");
  const fraction = text.split(".")[1] ?? "";
  if (fraction.length > decimals) throw new Error("precision");
  const units = parseUnits(text, decimals);
  if (units <= BigInt(0)) throw new Error("amount");
  return units;
}

/**
 * Wallet-side validation of an ERC-20 send on the EVM chain. Balances there are human numbers
 * (the compat API divides by decimals), so the check compares human amounts; the exact bigint
 * check against `balanceOf` happens again inside `sendErc20Transfer`.
 */
export function validateEvmTokenTransfer(input: {
  to: string; amount: string; decimals: number; balance: number; nativeBalance: number;
}): { units: bigint; human: number } {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.to.trim())) throw new Error("address");
  const units = parseTokenAmount(input.amount, input.decimals);
  const human = Number(formatUnits(units, input.decimals));
  if (!(human <= input.balance * (1 + 1e-12))) throw new Error("balance");
  if (!(input.nativeBalance > 0)) throw new Error("fee");
  return { units, human };
}

/**
 * Text for a human token amount (Max / percent buttons): the balance times `fraction`, truncated
 * (never rounded up) to the token's decimals, without exponent notation.
 */
export function humanAmountText(value: number, decimals: number, fraction = 1): string {
  const d = Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? decimals : 6;
  const scaled = Math.max(0, value) * fraction;
  if (!Number.isFinite(scaled) || scaled <= 0 || scaled >= 1e21) return "0";
  // toFixed(20) is the double's exact expansion; cutting it (not rounding) keeps the text <= value.
  const [whole, digits = ""] = scaled.toFixed(20).split(".");
  const text = d === 0 ? whole : `${whole}.${digits.slice(0, d)}`;
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

type ReplacedInfo = { reason: string };

/**
 * Wait for the receipt and require `status === "success"`. A reverted receipt, a timeout and a
 * transaction replaced by another one (cancelled or swapped; a plain fee bump is fine) each get
 * their own error code.
 */
export async function confirmTransfer(
  publicClient: TransferPublicClient,
  hash: Hex,
  opts: { timeoutMs?: number; pollingIntervalMs?: number } = {},
): Promise<void> {
  let replaced: ReplacedInfo | null = null;
  let receipt: { status: string };
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: opts.timeoutMs ?? 90_000,
      pollingInterval: opts.pollingIntervalMs ?? 2_000,
      onReplaced: (info: ReplacedInfo) => { replaced = info; },
    } as never);
  } catch {
    throw new WalletSendError(replaced ? "tx_replaced" : "tx_timeout", hash);
  }
  if (replaced && (replaced as ReplacedInfo).reason !== "repriced") throw new WalletSendError("tx_replaced", hash);
  if (receipt.status !== "success") throw new WalletSendError("tx_reverted", hash);
}

/** `transfer(to, amount)` on an ERC-20: balance check, preflight, send, confirm. Returns the hash. */
export async function sendErc20Transfer(
  input: { privateKey: Hex; token: string; to: string; amountUnits: bigint; onStage?: (stage: SendStage) => void },
  clients?: TransferClients,
): Promise<Hex> {
  if (!isAddress(input.token)) throw new WalletSendError("invalid_address");
  const args = erc20TransferArgs(input.to, input.amountUnits);
  const { publicClient, walletClient } = clients ?? (await defaultClients(input.privateKey));
  const token = getAddress(input.token);
  const sender = walletClient.account.address;
  const balance = (await publicClient.readContract({
    address: token, abi: erc20TransferAbi, functionName: "balanceOf", args: [sender],
  } as never)) as bigint;
  if (balance < input.amountUnits) throw new WalletSendError("insufficient_token_balance");
  input.onStage?.("sending");
  const hash = await preflightWriteContract(
    publicClient, sender,
    { address: token, abi: erc20TransferAbi, functionName: "transfer", args },
    (gas) => walletClient.writeContract({
      address: token, abi: erc20TransferAbi, functionName: "transfer", args, gas,
    } as never),
  );
  input.onStage?.("confirming");
  await confirmTransfer(publicClient, hash);
  return hash;
}

/** `safeTransferFrom(from, to, tokenId)`: `ownerOf` must be the sender, then preflight, send, confirm. */
export async function sendNftTransfer(
  input: { privateKey: Hex; collection: string; tokenId: bigint; to: string; onStage?: (stage: SendStage) => void },
  clients?: TransferClients,
): Promise<Hex> {
  if (!isAddress(input.collection)) throw new WalletSendError("invalid_address");
  const { publicClient, walletClient } = clients ?? (await defaultClients(input.privateKey));
  const collection = getAddress(input.collection);
  const sender = walletClient.account.address;
  const args = nftTransferArgs(sender, input.to, input.tokenId);
  const owner = await publicClient
    .readContract({ address: collection, abi: nftTransferAbi, functionName: "ownerOf", args: [input.tokenId] } as never)
    .catch(() => null);
  if (typeof owner !== "string" || owner.toLowerCase() !== sender.toLowerCase()) throw new WalletSendError("not_nft_owner");
  input.onStage?.("sending");
  const hash = await preflightWriteContract(
    publicClient, sender,
    { address: collection, abi: nftTransferAbi, functionName: "safeTransferFrom", args },
    (gas) => walletClient.writeContract({
      address: collection, abi: nftTransferAbi, functionName: "safeTransferFrom", args, gas,
    } as never),
  );
  input.onStage?.("confirming");
  await confirmTransfer(publicClient, hash);
  return hash;
}
