/**
 * Error classification for the token and NFT create flows.
 *
 * viem wraps the useful information several levels deep (`ContractFunctionExecutionError` ->
 * `ContractFunctionRevertedError` -> decoded revert data), and wallets add their own codes.
 * The UI must never print that raw text: these helpers turn it into a small code the localized
 * copy can explain, while the caller logs the original error with `console.error`.
 */
import {
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
  UserRejectedRequestError,
  parseEther,
} from "viem";

export type CreateFlowErrorCode =
  | "stable_fee_unavailable"
  | "insufficient_funds"
  | "wallet_rejected"
  | "network"
  | "unknown";

/** `InsufficientFloat(uint256,uint256)` from `StableFeeGateway`. */
export const INSUFFICIENT_FLOAT_SELECTOR = "0x51dd3741";

type AnyRecord = Record<string, unknown>;

type CollectedError = {
  text: string;
  lower: string;
  errorNames: string[];
  names: string[];
  codes: unknown[];
  hexes: string[];
  hasRevertData: boolean;
  insufficientFundsClass: boolean;
  userRejectedClass: boolean;
  httpClass: boolean;
  timeoutClass: boolean;
};

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function collectError(err: unknown): CollectedError {
  const messages: string[] = [];
  const errorNames: string[] = [];
  const names: string[] = [];
  const codes: unknown[] = [];
  const hexes: string[] = [];
  const seen = new Set<unknown>();
  let insufficientFundsClass = false;
  let userRejectedClass = false;
  let httpClass = false;
  let timeoutClass = false;

  const addHex = (value: string) => {
    if (/^0[xX][0-9a-fA-F]{8,}$/.test(value)) hexes.push(value);
  };

  const visit = (value: unknown, depth: number) => {
    if (value == null || depth > 12) return;
    if (typeof value === "string") {
      messages.push(value);
      addHex(value);
      return;
    }
    if (typeof value === "number" || typeof value === "bigint") {
      codes.push(value);
      return;
    }
    if (!isRecord(value) || seen.has(value)) return;
    seen.add(value);

    if (value instanceof InsufficientFundsError) insufficientFundsClass = true;
    if (value instanceof UserRejectedRequestError) userRejectedClass = true;
    if (value instanceof HttpRequestError) httpClass = true;
    if (value instanceof TimeoutError) timeoutClass = true;
    if (value instanceof ContractFunctionRevertedError && typeof value.raw === "string") addHex(value.raw);

    if (typeof value.name === "string") names.push(value.name);
    if (typeof value.errorName === "string") errorNames.push(value.errorName);
    if (value.code !== undefined) codes.push(value.code);

    for (const key of ["message", "shortMessage", "details", "reason"] as const) {
      const field = value[key];
      if (typeof field === "string") messages.push(field);
    }

    if (typeof value.data === "string") {
      messages.push(value.data);
      addHex(value.data);
    } else if (isRecord(value.data)) {
      if (typeof value.data.errorName === "string") errorNames.push(value.data.errorName);
      if (typeof value.data.message === "string") messages.push(value.data.message);
      visit(value.data, depth + 1);
    }
    if (typeof value.raw === "string") {
      messages.push(value.raw);
      addHex(value.raw);
    }
    if (typeof value.signature === "string") messages.push(value.signature);
    if (value.cause !== undefined) visit(value.cause, depth + 1);
  };

  visit(err, 0);
  const text = messages.join("\n");
  return {
    text,
    lower: text.toLowerCase(),
    errorNames,
    names,
    codes,
    hexes,
    hasRevertData: hexes.length > 0 || errorNames.length > 0,
    insufficientFundsClass,
    userRejectedClass,
    httpClass,
    timeoutClass,
  };
}

function parseWei(raw: string): bigint | null {
  try {
    if (/^0[xX][0-9a-fA-F]+$/.test(raw)) return BigInt(raw);
    if (/^\d+$/.test(raw)) return BigInt(raw);
    if (/^\d+\.\d+$/.test(raw)) return parseEther(raw);
  } catch {
    /* not a number */
  }
  return null;
}

function parseFunds(text: string): { neededWei?: bigint; balanceWei?: bigint } {
  const haveWant = text.match(/have\s+(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\s+want\s+(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)/i);
  if (haveWant) {
    const balanceWei = parseWei(haveWant[1]);
    const neededWei = parseWei(haveWant[2]);
    if (balanceWei !== null && neededWei !== null) return { neededWei, balanceWei };
  }
  const wantHave = text.match(/want\s+(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\s+(?:but\s+)?have\s+(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)/i);
  if (wantHave) {
    const neededWei = parseWei(wantHave[1]);
    const balanceWei = parseWei(wantHave[2]);
    if (balanceWei !== null && neededWei !== null) return { neededWei, balanceWei };
  }
  return {};
}

function hasCode(codes: unknown[], expected: number): boolean {
  return codes.some((code) => code === expected || code === String(expected));
}

export function classifyCreateFlowError(err: unknown): {
  code: CreateFlowErrorCode;
  neededWei?: bigint;
  balanceWei?: bigint;
} {
  const info = collectError(err);
  const funds = parseFunds(info.text);

  const stableFeeUnavailable =
    info.errorNames.includes("InsufficientFloat") ||
    info.names.includes("InsufficientFloat") ||
    info.hexes.some((hex) => hex.toLowerCase().startsWith(INSUFFICIENT_FLOAT_SELECTOR)) ||
    info.lower.includes("insufficientfloat");

  if (stableFeeUnavailable) return { code: "stable_fee_unavailable" };

  const insufficientFunds =
    info.insufficientFundsClass ||
    info.lower.includes("insufficient funds") ||
    info.lower.includes("exceeds balance") ||
    info.lower.includes("insufficientfee");

  if (insufficientFunds) return { code: "insufficient_funds", ...funds };

  const walletRejected =
    hasCode(info.codes, 4001) ||
    info.userRejectedClass ||
    info.lower.includes("user rejected") ||
    info.lower.includes("user denied");

  if (walletRejected) return { code: "wallet_rejected" };

  const chainMismatch =
    info.lower.includes("chain mismatch") ||
    info.lower.includes("does not match the target chain") ||
    info.lower.includes("wrong network");

  if (chainMismatch) return { code: "unknown" };

  const network =
    info.httpClass ||
    info.timeoutClass ||
    info.lower.includes("fetch failed") ||
    info.lower.includes("failed to fetch") ||
    info.lower.includes("http request failed") ||
    info.lower.includes("timeout") ||
    info.lower.includes("timed out") ||
    info.lower.includes("network error") ||
    info.lower.includes("network request failed") ||
    (hasCode(info.codes, -32603) && !info.hasRevertData);

  if (network) return { code: "network" };

  return { code: "unknown" };
}

/**
 * PPL the factory still expects as `msg.value`: the fee minus any credit prepaid through the
 * StableFeeGateway, never negative and never taking more credit than the fee itself.
 */
export function requiredFeeValue(feeWei: bigint, creditWei: bigint): bigint {
  const credit = creditWei < feeWei ? creditWei : feeWei;
  const value = feeWei - credit;
  return value > BigInt(0) ? value : BigInt(0);
}

/** Compare a wallet balance with the PPL needed for a fee plus gas. */
export function checkBalanceForCost(
  balanceWei: bigint,
  costWei: bigint,
): { ok: boolean; neededWei: bigint; balanceWei: bigint } {
  return { ok: balanceWei >= costWei, neededWei: costWei, balanceWei };
}
