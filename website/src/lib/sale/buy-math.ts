/**
 * Pure helpers for the `/buy` purchase flow. No I/O, no React, no env reads, so
 * the numbers that end up in a transaction can be unit-tested
 * (`scripts/buy-flow.test.mjs`).
 */

/** Default price-movement tolerance for a purchase: 1%. */
export const DEFAULT_SLIPPAGE_BPS = 100;

const BPS_DENOMINATOR = BigInt(10_000);

/** `minPplOut` for `buyWith`: the on-chain quote minus the slippage tolerance (floored). */
export function minOutFromQuote(pplOut: bigint, slippageBps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  if (pplOut <= BigInt(0)) return BigInt(0);
  const bps = Number.isFinite(slippageBps) ? Math.min(Math.max(Math.floor(slippageBps), 0), 10_000) : 0;
  return (pplOut * (BPS_DENOMINATOR - BigInt(bps))) / BPS_DENOMINATOR;
}

export type BuyAmountLimit = "requested" | "balance" | "perBuy" | "daily";

export type BuyAmountPlan = {
  /** USDC (6 decimals) to spend: min(balance, requested, per-buy cap, daily remainder). */
  amount6: bigint;
  /** Which input decided the amount; `requested` means nothing was trimmed. */
  limitedBy: BuyAmountLimit;
  /** USDC left in the wallet because the amount was capped below the balance. */
  leftover6: bigint;
};

/**
 * What to actually spend once funds have arrived on Base. Bridge fees leave the
 * wallet with less than was requested, and the contract caps both a single buy
 * and a day's spend, so the requested amount is only an upper bound.
 */
export function planBuyAmount(input: {
  requested6: bigint;
  balance6: bigint;
  maxPerBuy6: bigint;
  remainingDaily6: bigint;
}): BuyAmountPlan {
  const candidates: [BuyAmountLimit, bigint][] = [
    ["requested", input.requested6],
    ["balance", input.balance6],
    ["perBuy", input.maxPerBuy6],
    ["daily", input.remainingDaily6],
  ];
  let [limitedBy, amount6] = candidates[0];
  for (const [label, value] of candidates.slice(1)) {
    if (value < amount6) {
      limitedBy = label;
      amount6 = value;
    }
  }
  if (amount6 < BigInt(0)) amount6 = BigInt(0);
  const leftover6 = input.balance6 > amount6 ? input.balance6 - amount6 : BigInt(0);
  return { amount6, limitedBy, leftover6 };
}

/** The sale is closed when finalized, sold out, or past its window (`closesAt`). */
export function isSaleClosed(input: {
  finalized: boolean;
  soldOut: boolean;
  closesAt: bigint;
  nowSec: number;
}): boolean {
  if (input.finalized || input.soldOut) return true;
  return input.closesAt > BigInt(0) && BigInt(Math.floor(input.nowSec)) >= input.closesAt;
}

/* ── Errors ────────────────────────────────────────────────────────────── */

export type BuyOnBaseErrorCode =
  | "cooldown"
  | "dailyLimit"
  | "perBuyLimit"
  | "insufficient"
  | "noGas"
  | "rejected"
  | "soldOut"
  | "closed"
  | "notOpen"
  | "notVerified"
  | "slippage"
  | "paused"
  | "generic";

export type BuyErrorInfo = {
  code: BuyOnBaseErrorCode;
  /** Seconds until the next purchase is allowed (cooldown only). */
  waitSec?: number;
};

/** Thrown by the purchase flow itself (pre-checks), carrying a ready error code. */
export class BuyFlowError extends Error {
  readonly code: BuyOnBaseErrorCode;
  readonly waitSec?: number;

  constructor(code: BuyOnBaseErrorCode, waitSec?: number) {
    super(`buy_flow_${code}`);
    this.name = "BuyFlowError";
    this.code = code;
    this.waitSec = waitSec;
  }
}

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  shortMessage?: unknown;
  message?: unknown;
  cause?: unknown;
  data?: { errorName?: unknown; args?: unknown } | unknown;
  errorName?: unknown;
  args?: unknown;
};

function asLike(value: unknown): ErrorLike | null {
  return value && typeof value === "object" ? (value as ErrorLike) : null;
}

/** Walks the `cause` chain (bounded) and yields every error-like object. */
function* chain(err: unknown): Generator<ErrorLike> {
  let current = asLike(err);
  for (let depth = 0; current && depth < 8; depth += 1) {
    yield current;
    current = asLike(current.cause);
  }
}

function customErrorFrom(err: unknown): { name: string; args: readonly unknown[] } | null {
  for (const node of chain(err)) {
    const data = asLike(node.data);
    if (data && typeof data.errorName === "string") {
      return { name: data.errorName, args: Array.isArray(data.args) ? data.args : [] };
    }
    if (typeof node.errorName === "string") {
      return { name: node.errorName, args: Array.isArray(node.args) ? node.args : [] };
    }
  }
  return null;
}

function messageOf(err: unknown): string {
  const parts: string[] = [];
  for (const node of chain(err)) {
    if (typeof node.shortMessage === "string") parts.push(node.shortMessage);
    if (typeof node.message === "string") parts.push(node.message);
  }
  if (parts.length === 0) parts.push(String(err));
  return parts.join(" ").toLowerCase();
}

const CUSTOM_ERROR_CODES: Record<string, BuyOnBaseErrorCode> = {
  SoldOut: "soldOut",
  WindowOver: "closed",
  CurveClosed: "closed",
  NotFinalizable: "closed",
  NotOpen: "notOpen",
  OverPerBuyLimit: "perBuyLimit",
  OverDailyLimit: "dailyLimit",
  CooldownActive: "cooldown",
  NotVerified: "notVerified",
  Slippage: "slippage",
  EnforcedPause: "paused",
};

/**
 * Maps whatever a purchase attempt threw to a UI error code. Named contract
 * errors (decoded by viem from a simulation) win; message sniffing is the
 * fallback for wallet and RPC failures.
 */
export function mapBuyError(err: unknown, nowSec: number = Date.now() / 1000): BuyErrorInfo {
  if (err instanceof BuyFlowError) return { code: err.code, waitSec: err.waitSec };

  for (const node of chain(err)) {
    if (node.code === 4001 || node.code === "ACTION_REJECTED") return { code: "rejected" };
  }

  const custom = customErrorFrom(err);
  if (custom) {
    const code = CUSTOM_ERROR_CODES[custom.name];
    if (code === "cooldown") {
      const availableAt = typeof custom.args[0] === "bigint" ? Number(custom.args[0]) : NaN;
      const waitSec = Number.isFinite(availableAt) ? Math.max(1, Math.ceil(availableAt - nowSec)) : 60;
      return { code, waitSec };
    }
    if (code) return { code };
  }

  const msg = messageOf(err);
  if (msg.includes("user rejected") || msg.includes("user denied") || msg.includes("request rejected")) {
    return { code: "rejected" };
  }
  for (const [name, code] of Object.entries(CUSTOM_ERROR_CODES)) {
    if (msg.includes(`${name.toLowerCase()}(`) || msg.includes(`error: ${name.toLowerCase()}`)) {
      return code === "cooldown" ? { code, waitSec: 60 } : { code };
    }
  }
  if (msg.includes("insufficient funds for gas") || msg.includes("insufficient funds for transfer")) {
    return { code: "noGas" };
  }
  if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance")) {
    return { code: "insufficient" };
  }
  if (msg.includes("insufficient funds") || msg.includes("gas required exceeds")) {
    return { code: "noGas" };
  }
  return { code: "generic" };
}
