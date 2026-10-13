/**
 * Growth Epoch settlement.
 *
 * Approved Beta pipeline: budget, L1 and L2 only, edge / referrer / 8-epoch
 * caps, equal floor, tail stays in the pool. No new emission.
 * Settlement books Claimable escrow and, at epoch E+4, returns unclaimed
 * claims before B. It does not credit referrer balances.
 *
 * Active payout weights are L1 = 70 and L2 = 30 (denominator 100 when both
 * levels are payable). Referral structure is L1/L2 only (max depth 2)
 * weights exist, and non-1/2 levels never enter `weightSum` or claims.
 *
 * M13-2 (owner decision, anti-Sybil): a payable edge additionally requires both
 * ends to be identity-verified participants (see `isGrowthIdentityVerified`), and
 * one referrer is paid for at most `GROWTH_MAX_PAID_INVITEES_PER_REFERRER`
 * invitees per epoch. Weights and the 1% / 5% / 2% budget caps are unchanged.
 */

import {
  isGrowthIdentityVerified,
  isL1Eligible,
  isL2Eligible,
  type GrowthQualificationState
} from "./growth-qualification.js";
import {
  assertGrowthPoolConservation,
  growthPoolAvailable,
  type GrowthPoolState
} from "./growth-pool.js";

export const GROWTH_REFERENCE_WINDOW = 8;
export const GROWTH_CAP_WINDOW = 8;
/** Direct referral. Share of the active Growth reward budget. */
export const GROWTH_L1_WEIGHT = 70;
/** Second-level referral. Share of the active Growth reward budget. */
export const GROWTH_L2_WEIGHT = 30;
/** L1 + L2. Absent levels do not reserve this remainder of B. */
export const GROWTH_ACTIVE_WEIGHT_SUM = GROWTH_L1_WEIGHT + GROWTH_L2_WEIGHT;
if (GROWTH_ACTIVE_WEIGHT_SUM !== 100) {
  throw new Error("Active Growth payout weights must sum to 100");
}
/**
 * M13-2 (owner decision): a single referrer is paid for at most this many
 * distinct invitees per epoch. Caps the value of building a wide fake downline
 * on top of one verified account. Existing budget caps below are unchanged.
 */
export const GROWTH_MAX_PAID_INVITEES_PER_REFERRER = 50;
export const GROWTH_EDGE_CAP_PERCENT = 1;
export const GROWTH_REFERRER_CAP_PERCENT = 5;
export const GROWTH_WINDOW_CAP_PERCENT = 2;
/** Unclaimed Claimable returns at settlement of epoch E+4, before B. */
export const GROWTH_CLAIM_EXPIRY_EPOCHS = 4;

export type GrowthClaimStatus = "claimable" | "settled" | "returned";

export interface GrowthClaimRecord {
  epoch: number;
  referrer: string;
  referred: string;
  level: 1 | 2;
  amount: number;
  status: GrowthClaimStatus;
}

export interface GrowthSettlementState extends GrowthQualificationState {
  growthPool: GrowthPoolState;
  growthEpochInflow: Record<number, number>;
  growthEpochBudget: Record<number, number>;
  growthAssigned: Record<number, Record<string, number>>;
  growthClaims: Record<string, GrowthClaimRecord>;
  growthSettledEpochs: Record<number, true>;
}

export interface GrowthSettlementResult {
  epoch: number;
  inflow: number;
  reference: number;
  budget: number;
  escrowAdded: number;
  forfeited: boolean;
}

interface PayableTuple {
  referrer: string;
  referred: string;
  level: 1 | 2;
  weight: number;
}

export function growthClaimKey(epoch: number, referrer: string, referred: string, level: 1 | 2): string {
  return `${epoch}:${referrer}:${referred}:${level}`;
}

function requireEpoch(epoch: number): number {
  if (!Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error("Invalid growth epoch");
  }
  return epoch;
}

function requireAmount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function floorDiv(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) {
    throw new Error("Invalid growth division");
  }
  const value = numerator / denominator;
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Growth amount exceeds safe integer");
  }
  return Number(value);
}

/** Paid weight for a Growth level. Only L1 and L2 are payable; any other level returns 0. */
export function growthPayableWeight(level: number): number {
  if (level === 1) {
    return GROWTH_L1_WEIGHT;
  }
  if (level === 2) {
    return GROWTH_L2_WEIGHT;
  }
  return 0;
}

/**
 * `floor(B × weight / weightSum)` for one payable tuple, before caps.
 * `weightSum` is the sum of active L1/L2 weights on payable tuples.
 */
export function growthRawAmount(budget: number, weight: number, weightSum: number): number {
  requireAmount(budget, "Growth budget");
  if (!Number.isSafeInteger(weight) || weight < 0) {
    throw new Error("Growth weight must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(weightSum) || weightSum <= 0) {
    throw new Error("Invalid growth division");
  }
  return floorDiv(BigInt(budget) * BigInt(weight), BigInt(weightSum));
}

/**
 * Bootstrap: epoch 1 uses its own inflow.
 * Later epochs use the floor average of previous completed inflows, at most 8.
 * The current epoch is excluded. Missing and zero inflows count. Returns do not.
 */
export function growthReference(epochInflow: Readonly<Record<number, number>>, epoch: number): number {
  const current = requireEpoch(epoch);
  if (current === 1) {
    return requireAmount(epochInflow[1] ?? 0, "Growth epoch inflow");
  }
  const start = Math.max(1, current - GROWTH_REFERENCE_WINDOW);
  let sum = 0n;
  let count = 0n;
  for (let cursor = start; cursor < current; cursor += 1) {
    sum += BigInt(requireAmount(epochInflow[cursor] ?? 0, "Growth epoch inflow"));
    count += 1n;
  }
  return floorDiv(sum, count);
}

function ensureMaps(state: GrowthSettlementState): void {
  state.growthEpochInflow ??= {};
  state.growthEpochBudget ??= {};
  state.growthAssigned ??= {};
  state.growthClaims ??= {};
  state.growthSettledEpochs ??= {};
}

function compareTuples(left: PayableTuple, right: PayableTuple): number {
  if (left.referrer < right.referrer) {
    return -1;
  }
  if (left.referrer > right.referrer) {
    return 1;
  }
  if (left.referred < right.referred) {
    return -1;
  }
  if (left.referred > right.referred) {
    return 1;
  }
  return left.level - right.level;
}

function collectTuples(state: GrowthSettlementState, epoch: number): PayableTuple[] {
  const tuples: PayableTuple[] = [];
  for (const referred of Object.keys(state.participants)) {
    const child = state.participants[referred];
    const parent = child?.parent;
    if (!parent) {
      continue;
    }
    // M13-2: both ends of a paid edge must be identity-verified, otherwise one
    // verified referrer could farm the budget through unverified throwaway children.
    if (isGrowthIdentityVerified(state, parent) && isL1Eligible(state, referred, epoch).qualified) {
      const weight = growthPayableWeight(1);
      if (weight > 0) {
        tuples.push({ referrer: parent, referred, level: 1, weight });
      }
    }
    const grandparent = state.participants[parent]?.parent;
    if (grandparent && isGrowthIdentityVerified(state, grandparent) && isL2Eligible(state, referred, epoch).qualified) {
      const weight = growthPayableWeight(2);
      if (weight > 0) {
        tuples.push({ referrer: grandparent, referred, level: 2, weight });
      }
    }
    // Only parent (L1) and grandparent (L2) are collected. Deeper ancestors are outside the L1/L2 referral structure.
  }
  tuples.sort(compareTuples);
  return capInviteesPerReferrer(tuples);
}

/**
 * M13-2: keep at most `GROWTH_MAX_PAID_INVITEES_PER_REFERRER` distinct invitees
 * per referrer. Input is already sorted by (referrer, referred, level), so the
 * selection is the same on every node; both levels of a kept invitee stay.
 */
function capInviteesPerReferrer(tuples: readonly PayableTuple[]): PayableTuple[] {
  const kept: PayableTuple[] = [];
  const seen = new Map<string, Set<string>>();
  for (const tuple of tuples) {
    let invitees = seen.get(tuple.referrer);
    if (!invitees) {
      invitees = new Set<string>();
      seen.set(tuple.referrer, invitees);
    }
    if (!invitees.has(tuple.referred)) {
      if (invitees.size >= GROWTH_MAX_PAID_INVITEES_PER_REFERRER) {
        continue;
      }
      invitees.add(tuple.referred);
    }
    kept.push(tuple);
  }
  return kept;
}

function windowBudget(budgets: Readonly<Record<number, number>>, epoch: number, currentBudget: number): bigint {
  const start = Math.max(1, epoch - (GROWTH_CAP_WINDOW - 1));
  let sum = 0n;
  for (let cursor = start; cursor < epoch; cursor += 1) {
    sum += BigInt(requireAmount(budgets[cursor] ?? 0, "Growth epoch budget"));
  }
  return sum + BigInt(currentBudget);
}

function expiringClaimKeys(state: GrowthSettlementState, epoch: number): string[] {
  const origin = epoch - GROWTH_CLAIM_EXPIRY_EPOCHS;
  if (origin < 1) {
    return [];
  }
  return Object.keys(state.growthClaims)
    .filter((key) => {
      const claim = state.growthClaims[key];
      return claim?.epoch === origin && claim.status === "claimable";
    })
    .sort();
}

function assignedInWindow(state: GrowthSettlementState, epoch: number, referrer: string): number {
  const start = Math.max(1, epoch - (GROWTH_CAP_WINDOW - 1));
  let sum = 0;
  for (let cursor = start; cursor < epoch; cursor += 1) {
    sum += requireAmount(state.growthAssigned[cursor]?.[referrer] ?? 0, "Growth assigned");
  }
  return sum;
}

/**
 * One settlement of `epoch`. A second call throws before any write.
 * Unclaimed claims from epoch E-4 return to the pool before B.
 * Amount > 0 becomes Claimable and increases escrow. Balances stay unchanged.
 */
export function settleGrowthEpoch(state: GrowthSettlementState, epoch: number): GrowthSettlementResult {
  const current = requireEpoch(epoch);
  if (state.growthSettledEpochs?.[current]) {
    throw new Error("Growth epoch already settled");
  }
  ensureMaps(state);

  const expiringKeys = expiringClaimKeys(state, current);
  let returning = 0;
  for (const key of expiringKeys) {
    returning += requireAmount(state.growthClaims[key]!.amount, "Growth claim");
  }
  const escrowAfterReturn = state.growthPool.escrow - returning;
  const returnedAfter = state.growthPool.totalReturned + returning;
  if (!Number.isSafeInteger(escrowAfterReturn) || escrowAfterReturn < 0 || !Number.isSafeInteger(returnedAfter)) {
    throw new Error("Growth claim return failed conservation");
  }
  const poolAfterReturn = {
    ...state.growthPool,
    escrow: escrowAfterReturn,
    totalReturned: returnedAfter
  };
  assertGrowthPoolConservation(poolAfterReturn);

  const inflow = requireAmount(state.growthEpochInflow[current] ?? 0, "Growth epoch inflow");
  const reference = growthReference(state.growthEpochInflow, current);
  const available = growthPoolAvailable(poolAfterReturn);
  if (!Number.isSafeInteger(available) || available < 0) {
    throw new Error("Growth Pool available is negative");
  }
  const budget = Math.min(available, reference);
  const tuples = collectTuples(state, current);

  let escrowAdded = 0;
  const finals: Array<PayableTuple & { amount: number }> = [];

  if (budget > 0 && tuples.length > 0) {
    let weightSum = 0n;
    for (const tuple of tuples) {
      if (tuple.level !== 1 && tuple.level !== 2) {
        continue;
      }
      weightSum += BigInt(tuple.weight);
    }
    if (weightSum > 0n) {
      const edgeCap = floorDiv(BigInt(budget) * BigInt(GROWTH_EDGE_CAP_PERCENT), 100n);
      const referrerCap = floorDiv(BigInt(budget) * BigInt(GROWTH_REFERRER_CAP_PERCENT), 100n);
      const windowCap = floorDiv(
        windowBudget(state.growthEpochBudget, current, budget) * BigInt(GROWTH_WINDOW_CAP_PERCENT),
        100n
      );
      const postCap = new Array<number>(tuples.length);
      const usedThisEpoch = new Map<string, number>();

      for (let index = 0; index < tuples.length; index += 1) {
        const tuple = tuples[index]!;
        if (tuple.level !== 1 && tuple.level !== 2) {
          postCap[index] = 0;
          continue;
        }
        const raw = floorDiv(BigInt(budget) * BigInt(tuple.weight), weightSum);
        const used = usedThisEpoch.get(tuple.referrer) ?? 0;
        const referrerRoom = referrerCap - used;
        const windowRoom = windowCap - (assignedInWindow(state, current, tuple.referrer) + used);
        const amount = Math.min(raw, edgeCap, Math.max(0, referrerRoom), Math.max(0, windowRoom));
        postCap[index] = amount;
        usedThisEpoch.set(tuple.referrer, used + amount);
      }

      for (let index = 0; index < tuples.length; ) {
        let end = index + 1;
        while (end < tuples.length && tuples[end]!.referrer === tuples[index]!.referrer) {
          end += 1;
        }
        const count = end - index;
        let groupTotal = 0;
        for (let cursor = index; cursor < end; cursor += 1) {
          groupTotal += postCap[cursor]!;
        }
        const share = Math.min(floorDiv(BigInt(groupTotal), BigInt(count)), edgeCap);
        if (share > 0) {
          for (let cursor = index; cursor < end; cursor += 1) {
            const tuple = tuples[cursor]!;
            if (tuple.level !== 1 && tuple.level !== 2) {
              continue;
            }
            finals.push({ ...tuple, amount: share });
            escrowAdded += share;
          }
        }
        index = end;
      }
    }
  }

  if (!Number.isSafeInteger(escrowAdded) || escrowAdded < 0 || escrowAdded > budget) {
    throw new Error("Growth settlement exceeds budget");
  }
  const nextEscrow = escrowAfterReturn + escrowAdded;
  if (!Number.isSafeInteger(nextEscrow)) {
    throw new Error("Growth Pool escrow exceeds safe integer");
  }

  for (const key of expiringKeys) {
    const claim = state.growthClaims[key]!;
    state.growthClaims[key] = { ...claim, status: "returned" };
  }
  state.growthPool.totalReturned = returnedAfter;
  state.growthPool.escrow = nextEscrow;
  state.growthEpochInflow[current] = inflow;
  state.growthEpochBudget[current] = budget;
  const assigned: Record<string, number> = {};
  for (const row of finals) {
    const key = growthClaimKey(current, row.referrer, row.referred, row.level);
    state.growthClaims[key] = {
      epoch: current,
      referrer: row.referrer,
      referred: row.referred,
      level: row.level,
      amount: row.amount,
      status: "claimable"
    };
    assigned[row.referrer] = (assigned[row.referrer] ?? 0) + row.amount;
  }
  if (Object.keys(assigned).length > 0) {
    state.growthAssigned[current] = assigned;
  }
  assertGrowthPoolConservation(state.growthPool);
  state.growthSettledEpochs[current] = true;

  return {
    epoch: current,
    inflow,
    reference,
    budget,
    escrowAdded,
    forfeited: escrowAdded === 0
  };
}
