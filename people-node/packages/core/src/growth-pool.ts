/**
 * Growth Pool accounting.
 *
 * The bucket is separate from Community Pool, treasury, validator rewards,
 * and burn. Crediting it does not mint tokens and does not settle or pay.
 *
 * Model A (30/25/20/10/15/0) is the live split for an eligible integer fee.
 * `GROWTH_FEE_SPLIT_ACTIVE` is true. `applyTransaction` and `routeTradingFee`
 * credit the buckets. Integer floor; the remainder stays in the validator
 * share. Each eligible component is floored on its own. No new units are
 * created to fill a bucket.
 *
 * Settlement, claims, caps, and payouts are not here.
 */

import type { TxType } from "@ovn/protocol";

export const GROWTH_FEE_SPLIT_ACTIVE = true;

export const APPROVED_MODEL_A_SHARES = Object.freeze({
  validatorShare: 30,
  communityShare: 25,
  treasuryShare: 20,
  liquidityShare: 10,
  growthShare: 15,
  burnShare: 0
});

const APPROVED_SHARE_SUM =
  APPROVED_MODEL_A_SHARES.validatorShare +
  APPROVED_MODEL_A_SHARES.communityShare +
  APPROVED_MODEL_A_SHARES.treasuryShare +
  APPROVED_MODEL_A_SHARES.liquidityShare +
  APPROVED_MODEL_A_SHARES.growthShare +
  APPROVED_MODEL_A_SHARES.burnShare;

if (APPROVED_SHARE_SUM !== 100) {
  throw new Error("Approved fee split must sum to 100");
}

export const ELIGIBLE_GROWTH_FEE_SOURCES = [
  "transfer_fee",
  "token_launch_fee",
  "protocol_tx_fee",
  "curve_trading_fee"
] as const;

export const INELIGIBLE_GROWTH_AMOUNT_SOURCES = [
  "principal",
  "stake",
  "project_token",
  "nft_fee",
  "amm_swap_fee",
  "promotion_fee",
  "api_fee"
] as const;

export type EligibleGrowthFeeSource = (typeof ELIGIBLE_GROWTH_FEE_SOURCES)[number];
export type IneligibleGrowthAmountSource = (typeof INELIGIBLE_GROWTH_AMOUNT_SOURCES)[number];
export type GrowthAmountSource = EligibleGrowthFeeSource | IneligibleGrowthAmountSource;

const ELIGIBLE_SOURCE_SET = new Set<string>(ELIGIBLE_GROWTH_FEE_SOURCES);

/**
 * Protocol tx types whose `tx.fee` is debited today and is not already
 * classified as transfer fee or token launch fee. Stake and curve principal
 * are not this fee. Types that do not debit `tx.fee` are omitted.
 */
const PROTOCOL_TX_FEE_TYPES = new Set<TxType>([
  "joinValidator",
  "proposal",
  "creatorClaim",
  "curveBuy",
  "curveSell",
  "nftMint",
  "nftTransfer",
  "contractDeploy",
  "contractCall",
  "ammCreatePool",
  "ammAddLiquidity",
  "ammRemoveLiquidity",
  "ammSwap"
]);

export interface GrowthFeeSplitSwitch {
  /** Production uses the live constant. `false` is only a pure comparison. */
  active: boolean;
}

export interface GrowthPoolState {
  totalInflow: number;
  totalReturned: number;
  claimedSettled: number;
  escrow: number;
}

export interface ApprovedFeeSplitResult {
  active: boolean;
  validatorAmount: number;
  communityAmount: number;
  treasuryAmount: number;
  liquidityAmount: number;
  growthAmount: number;
  burnAmount: number;
  total: number;
}

export interface EligibleFeeComponent {
  source: EligibleGrowthFeeSource;
  amount: number;
}

export interface FeeBaseInput {
  txType: TxType;
  txFee: number;
  /** Curve trading fee from `routeTradingFee`. Not `tx.fee`, not principal. */
  curveTradingFee?: number;
  principal?: number;
  stake?: number;
  projectToken?: number;
  nftFee?: number;
  ammSwapFee?: number;
  promotionFee?: number;
  apiFee?: number;
}

export function createGrowthPoolState(): GrowthPoolState {
  return {
    totalInflow: 0,
    totalReturned: 0,
    claimedSettled: 0,
    escrow: 0
  };
}

/** Live switch. Production routing uses this and does not pass `active: false`. */
export function growthFeeSplitSwitch(): GrowthFeeSplitSwitch {
  return { active: GROWTH_FEE_SPLIT_ACTIVE };
}

function switchIsActive(feeSwitch: GrowthFeeSplitSwitch | undefined): boolean {
  return feeSwitch?.active === true;
}

function requireNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function floorPercent(amount: number, percent: number): number {
  return Number((BigInt(amount) * BigInt(percent)) / 100n);
}

/** `totalDebited = claimedSettled + escrow + totalReturned`. Escrow is one term. */
export function growthPoolTotalDebited(pool: GrowthPoolState): number {
  return pool.claimedSettled + pool.escrow + pool.totalReturned;
}

/**
 * `available = totalInflow - totalDebited + totalReturned`.
 * Adding `totalReturned` back means escrow inside `totalDebited` is not removed twice.
 * Returned claim value is not added to `totalInflow`.
 */
export function growthPoolAvailable(pool: GrowthPoolState): number {
  return pool.totalInflow - growthPoolTotalDebited(pool) + pool.totalReturned;
}

export function assertGrowthPoolConservation(pool: GrowthPoolState): void {
  const fields = [
    ["totalInflow", pool.totalInflow],
    ["totalReturned", pool.totalReturned],
    ["claimedSettled", pool.claimedSettled],
    ["escrow", pool.escrow]
  ] as const;
  for (const [name, value] of fields) {
    requireNonNegativeSafeInteger(value, `Growth Pool ${name}`);
  }
  const available = growthPoolAvailable(pool);
  if (!Number.isSafeInteger(available) || available < 0) {
    throw new Error("Growth Pool available is negative");
  }
  if (available + pool.escrow + pool.claimedSettled !== pool.totalInflow) {
    throw new Error("Growth Pool conservation failed");
  }
}

function legacySplit(totalFee: number): ApprovedFeeSplitResult {
  return {
    active: false,
    validatorAmount: totalFee,
    communityAmount: 0,
    treasuryAmount: 0,
    liquidityAmount: 0,
    growthAmount: 0,
    burnAmount: 0,
    total: totalFee
  };
}

/**
 * Integer floor split of one eligible fee. Remainder stays in `validatorAmount`.
 * The live switch is on. An explicit `{ active: false }` is not the block path.
 * This does not replace `FeeSplitter` for an explicit non-legacy `feeSplit`.
 */
export function calculateApprovedFeeSplit(
  totalFee: number,
  feeSwitch: GrowthFeeSplitSwitch = growthFeeSplitSwitch()
): ApprovedFeeSplitResult {
  const fee = requireNonNegativeSafeInteger(totalFee, "fee");
  if (!switchIsActive(feeSwitch)) {
    return legacySplit(fee);
  }
  const communityAmount = floorPercent(fee, APPROVED_MODEL_A_SHARES.communityShare);
  const treasuryAmount = floorPercent(fee, APPROVED_MODEL_A_SHARES.treasuryShare);
  const liquidityAmount = floorPercent(fee, APPROVED_MODEL_A_SHARES.liquidityShare);
  const growthAmount = floorPercent(fee, APPROVED_MODEL_A_SHARES.growthShare);
  const burnAmount = floorPercent(fee, APPROVED_MODEL_A_SHARES.burnShare);
  const assigned = communityAmount + treasuryAmount + liquidityAmount + growthAmount + burnAmount;
  const validatorAmount = fee - assigned;
  if (!Number.isSafeInteger(validatorAmount) || validatorAmount < 0) {
    throw new Error("Approved fee split failed conservation");
  }
  return {
    active: true,
    validatorAmount,
    communityAmount,
    treasuryAmount,
    liquidityAmount,
    growthAmount,
    burnAmount,
    total: fee
  };
}

function readIgnoredAmount(value: number | undefined, label: string): void {
  if (value === undefined) {
    return;
  }
  requireNonNegativeSafeInteger(value, label);
}

/**
 * Closed eligible set for one transaction.
 * Token launch fee is `tokenCreate`'s `tx.fee` once, not also `protocol_tx_fee`.
 * Transfer fee is the transfer `tx.fee` once.
 * Curve trading fee is a second amount, only on curve buy and sell.
 * Principal, stake, project-token, NFT, AMM, promotion, and API amounts are ignored.
 */
export function listEligibleFeeComponents(input: FeeBaseInput): EligibleFeeComponent[] {
  const txFee = requireNonNegativeSafeInteger(input.txFee, "txFee");
  if (input.curveTradingFee !== undefined) {
    requireNonNegativeSafeInteger(input.curveTradingFee, "curveTradingFee");
  }
  readIgnoredAmount(input.principal, "principal");
  readIgnoredAmount(input.stake, "stake");
  readIgnoredAmount(input.projectToken, "projectToken");
  readIgnoredAmount(input.nftFee, "nftFee");
  readIgnoredAmount(input.ammSwapFee, "ammSwapFee");
  readIgnoredAmount(input.promotionFee, "promotionFee");
  readIgnoredAmount(input.apiFee, "apiFee");

  const components: EligibleFeeComponent[] = [];
  if (input.txType === "transfer" && txFee > 0) {
    components.push({ source: "transfer_fee", amount: txFee });
  } else if (input.txType === "tokenCreate" && txFee > 0) {
    components.push({ source: "token_launch_fee", amount: txFee });
  } else if (PROTOCOL_TX_FEE_TYPES.has(input.txType) && txFee > 0) {
    components.push({ source: "protocol_tx_fee", amount: txFee });
  }

  if (
    (input.txType === "curveBuy" || input.txType === "curveSell") &&
    input.curveTradingFee !== undefined &&
    input.curveTradingFee > 0
  ) {
    components.push({ source: "curve_trading_fee", amount: input.curveTradingFee });
  }
  return components;
}

function addInflow(pool: GrowthPoolState, inflow: number): void {
  if (inflow === 0) {
    return;
  }
  const next = pool.totalInflow + inflow;
  if (!Number.isSafeInteger(next)) {
    throw new Error("Growth Pool inflow exceeds safe integer");
  }
  pool.totalInflow = next;
}

/**
 * Credits `floor(amount * 15 / 100)` into `totalInflow` only.
 * An ineligible source leaves inflow unchanged and returns 0.
 * Does not move escrow, claims, or settled amounts, and does not mint.
 */
export function creditGrowthPool(
  pool: GrowthPoolState,
  source: GrowthAmountSource,
  amount: number,
  feeSwitch: GrowthFeeSplitSwitch = growthFeeSplitSwitch()
): number {
  const value = requireNonNegativeSafeInteger(amount, "amount");
  assertGrowthPoolConservation(pool);
  if (!switchIsActive(feeSwitch) || !ELIGIBLE_SOURCE_SET.has(source)) {
    return 0;
  }
  const inflow = floorPercent(value, APPROVED_MODEL_A_SHARES.growthShare);
  addInflow(pool, inflow);
  assertGrowthPoolConservation(pool);
  return inflow;
}

/**
 * Credits each eligible component's 15% floor once.
 * The block path credits every Model A bucket, not only this inflow.
 * Does not move escrow, claims, or settled amounts, and does not mint.
 */
export function creditEligibleFeeBase(
  pool: GrowthPoolState,
  input: FeeBaseInput,
  feeSwitch: GrowthFeeSplitSwitch = growthFeeSplitSwitch()
): number {
  assertGrowthPoolConservation(pool);
  const components = listEligibleFeeComponents(input);
  if (!switchIsActive(feeSwitch)) {
    return 0;
  }
  let inflow = 0;
  for (const component of components) {
    const part = floorPercent(component.amount, APPROVED_MODEL_A_SHARES.growthShare);
    inflow += part;
    if (!Number.isSafeInteger(inflow)) {
      throw new Error("Growth Pool inflow exceeds safe integer");
    }
  }
  addInflow(pool, inflow);
  assertGrowthPoolConservation(pool);
  return inflow;
}
