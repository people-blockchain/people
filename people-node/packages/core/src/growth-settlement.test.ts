import { describe, expect, test } from "vitest";
import {
  APPROVED_MODEL_A_SHARES,
  DEFAULT_CONFIG,
  DEV_FAUCET_PRIVATE_KEY,
  FAUCET_ADDRESS,
  GENESIS_FAUCET_BALANCE,
  GROWTH_ACTIVE_WEIGHT_SUM,
  GROWTH_CLAIM_EXPIRY_EPOCHS,
  GROWTH_EDGE_CAP_PERCENT,
  GROWTH_EPOCH_LENGTH,
  GROWTH_L1_WEIGHT,
  GROWTH_L2_WEIGHT,
  GROWTH_REFERRER_CAP_PERCENT,
  GROWTH_WINDOW_CAP_PERCENT,
  NATIVE_ASSET_ID,
  buildBlock,
  computeStateRoot,
  createInitialState,
  enqueueTransaction,
  growthClaimKey,
  growthPayableWeight,
  growthPoolAvailable,
  growthRawAmount,
  growthReference,
  hashJson,
  referralMaturedAt,
  settleGrowthEpoch,
  signTransaction,
  tryApplyRemoteBlock,
  type ChainState
} from "./index.js";

function addr(n: number): string {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

function creditInflow(state: ChainState, epoch: number, amount: number): void {
  state.growthEpochInflow[epoch] = (state.growthEpochInflow[epoch] ?? 0) + amount;
  state.growthPool.totalInflow += amount;
}

/**
 * M13-2: Growth L1/L2 is payable only between identity-verified participants, so
 * the fixtures for the payout math mark both ends verified. The gate itself is
 * covered by `growth-sybil-gate.test.ts`.
 */
function put(state: ChainState, address: string, parent?: string): void {
  const identityVerified = { method: "telegram", verifiedAtHeight: 1 };
  state.participants[address] = parent
    ? { address, parent, linkedAtHeight: 1, registeredAtHeight: 1, identityVerified }
    : { address, registeredAtHeight: 1, identityVerified };
}

function mark(state: ChainState, address: string, contribution: number, network: number): void {
  state.contributionEpochs[address] = Array.from({ length: contribution }, (_, index) => index + 1);
  state.networkActivityEpochs[address] = Array.from({ length: network }, (_, index) => index + 1);
}

describe("growth reference", () => {
  test("epoch 1 uses its own inflow, including zero", async () => {
    expect(growthReference({ 1: 100 }, 1)).toBe(100);
    expect(growthReference({ 1: 0 }, 1)).toBe(0);
    expect(growthReference({}, 1)).toBe(0);
  });

  test("later epochs average previous inflows and keep the current epoch out", async () => {
    expect(growthReference({ 1: 100, 2: 200 }, 2)).toBe(100);
    const prior = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, 100]));
    expect(growthReference({ ...prior, 10: 200 }, 10)).toBe(100);
  });

  test("zeros count and a return is not an inflow", async () => {
    expect(growthReference({ 1: 100, 2: 0, 3: 100 }, 4)).toBe(66);
    const state = createPool();
    creditInflow(state, 1, 100);
    state.growthPool.totalReturned = 40;
    expect(growthReference(state.growthEpochInflow, 2)).toBe(100);
    const settled = settleGrowthEpoch(state, 2);
    expect(settled.reference).toBe(100);
    expect(settled.budget).toBe(100);
    expect(state.growthPool.totalReturned).toBe(40);
  });
});

describe("growth epoch settlement", () => {
  test("an empty budget forfeits, creates no claim, and does not mint", async () => {
    const state = createPool();
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const faucet = state.accounts[FAUCET_ADDRESS]!.balance;
    const settled = settleGrowthEpoch(state, 1);
    expect(settled).toMatchObject({ inflow: 0, reference: 0, budget: 0, escrowAdded: 0, forfeited: true });
    expect(state.growthSettledEpochs[1]).toBe(true);
    expect(state.growthClaims).toEqual({});
    expect(state.growthPool.escrow).toBe(0);
    expect(state.growthPool.claimedSettled).toBe(0);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.accounts[FAUCET_ADDRESS]!.balance).toBe(faucet);
    expect(supply).toBe(GENESIS_FAUCET_BALANCE);
    expect(state.validators).toEqual({});
    expect(DEFAULT_CONFIG.referralShare).toBe(0.05);
  });

  test("budget is the minimum of available and reference", async () => {
    const tight = createPool();
    tight.growthEpochInflow[1] = 1000;
    tight.growthPool.totalInflow = 40;
    expect(settleGrowthEpoch(tight, 1)).toMatchObject({ reference: 1000, budget: 40, forfeited: true });

    const reserve = createPool();
    creditInflow(reserve, 1, 100);
    reserve.growthPool.totalInflow = 500;
    expect(settleGrowthEpoch(reserve, 1)).toMatchObject({ reference: 100, budget: 100, forfeited: true });
    expect(reserve.growthPool.escrow).toBe(0);
  });

  test("three L1 edges share the capped total and the remainder stays in the pool", async () => {
    const state = qualifiedReferrer(4, [2, 3, 4]);
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const settled = settleGrowthEpoch(state, 4);
    expect(settled.budget).toBe(1000);
    expect(settled.escrowAdded).toBe(18);
    expect(state.growthPool.escrow).toBe(18);
    expect(state.growthPool.claimedSettled).toBe(0);
    const amounts = [2, 3, 4].map((child) => state.growthClaims[growthClaimKey(4, addr(1), addr(child), 1)]!.amount);
    expect(amounts).toEqual([6, 6, 6]);
    expect(state.growthAssigned[4]?.[addr(1)]).toBe(18);
    expect(Object.values(state.growthClaims).every((claim) => claim.status === "claimable" && claim.level === 1)).toBe(true);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.accounts[FAUCET_ADDRESS]!.balance).toBe(GENESIS_FAUCET_BALANCE);
  });

  test("participant insertion order does not change the claims", async () => {
    const forward = qualifiedReferrer(4, [2, 3, 4]);
    const reverse = qualifiedReferrer(4, [4, 3, 2]);
    settleGrowthEpoch(forward, 4);
    settleGrowthEpoch(reverse, 4);
    expect(JSON.stringify(forward.growthClaims)).toBe(JSON.stringify(reverse.growthClaims));
    expect(forward.growthPool.escrow).toBe(reverse.growthPool.escrow);
  });

  test("only L1 and L2 are paid and unpaid levels are absent from the denominator", async () => {
    expect(GROWTH_L1_WEIGHT).toBe(70);
    expect(GROWTH_L2_WEIGHT).toBe(30);
    expect(GROWTH_L1_WEIGHT + GROWTH_L2_WEIGHT).toBe(100);
    expect(GROWTH_ACTIVE_WEIGHT_SUM).toBe(100);
    expect(growthPayableWeight(3)).toBe(0);
    expect(growthPayableWeight(4)).toBe(0);
    expect(growthPayableWeight(5)).toBe(0);

    const chain = createPool();
    for (const epoch of [1, 2, 3, 4, 5]) {
      creditInflow(chain, epoch, 10_000);
    }
    put(chain, addr(1));
    put(chain, addr(2), addr(1));
    put(chain, addr(3), addr(2));
    put(chain, addr(4), addr(3));
    mark(chain, addr(4), 5, 6);
    const settled = settleGrowthEpoch(chain, 6);
    expect(settled.budget).toBe(10_000);
    const claims = Object.values(chain.growthClaims);
    expect(claims.map((claim) => claim.level).sort()).toEqual([1, 2]);
    expect(claims.map((claim) => claim.referrer).sort()).toEqual([addr(2), addr(3)]);
    expect(claims.every((claim) => claim.amount === 100)).toBe(true);
    expect(chain.growthPool.escrow).toBe(200);

    const wide = createPool();
    for (const epoch of [1, 2, 3]) {
      creditInflow(wide, epoch, 10_000);
    }
    for (let index = 1; index <= 101; index += 1) {
      put(wide, addr(index));
      const child = addr(1_000 + index);
      put(wide, child, addr(index));
      mark(wide, child, 4, 4);
    }
    settleGrowthEpoch(wide, 4);
    const paid = Object.values(wide.growthClaims);
    expect(paid).toHaveLength(101);
    expect(paid.every((claim) => claim.level === 1 && claim.amount === 99)).toBe(true);
    expect(wide.growthPool.escrow).toBe(9999);
  });

  test("a referrer cap cuts the group before the equal split", async () => {
    const state = createPool();
    for (let epoch = 1; epoch <= 7; epoch += 1) {
      creditInflow(state, epoch, 1000);
      state.growthEpochBudget[epoch] = 100_000;
    }
    put(state, addr(1));
    for (let child = 2; child <= 7; child += 1) {
      put(state, addr(child), addr(1));
      mark(state, addr(child), 5, 6);
    }
    const settled = settleGrowthEpoch(state, 8);
    expect(settled.budget).toBe(1000);
    const amounts = Object.values(state.growthClaims).map((claim) => claim.amount);
    expect(amounts).toEqual([8, 8, 8, 8, 8, 8]);
    expect(state.growthPool.escrow).toBe(48);
  });

  test("previous assignment stays in the 8-epoch cap", async () => {
    const state = qualifiedReferrer(4, [2]);
    state.growthAssigned[1] = { [addr(1)]: 20 };
    const settled = settleGrowthEpoch(state, 4);
    expect(settled.escrowAdded).toBe(0);
    expect(state.growthClaims).toEqual({});
    expect(state.growthAssigned[1]?.[addr(1)]).toBe(20);
    expect(state.growthPool.escrow).toBe(0);
  });

  test("settling the same epoch twice does not escrow again", async () => {
    const state = qualifiedReferrer(4, [2, 3, 4]);
    settleGrowthEpoch(state, 4);
    const escrow = state.growthPool.escrow;
    const claims = JSON.stringify(state.growthClaims);
    expect(() => settleGrowthEpoch(state, 4)).toThrow(/Growth epoch already settled/);
    expect(state.growthPool.escrow).toBe(escrow);
    expect(JSON.stringify(state.growthClaims)).toBe(claims);
  });

  test("a normal block records inflow and the epoch boundary settles inside the state root", async () => {
    const open = createPool();
    const wallet = addr(9);
    enqueueTransaction(
      open,
      signTransaction(DEV_FAUCET_PRIVATE_KEY, {
        id: "fee-into-epoch",
        from: FAUCET_ADDRESS,
        to: wallet,
        amount: 10,
        fee: 100,
        nonce: 0,
        timestamp: 1_700_000_000_000,
        type: "transfer"
      })
    );
    const early = await buildBlock(open, "bootstrap-validator", DEFAULT_CONFIG);
    expect(early.header.height).toBe(1);
    expect(open.growthEpochInflow[1]).toBe(15_000_000);
    expect(open.growthSettledEpochs).toEqual({});
    expect(open.accounts[FAUCET_ADDRESS]!.balance).toBe(GENESIS_FAUCET_BALANCE - 110);
    const supply = open.assets[NATIVE_ASSET_ID]!.totalSupply;
    const settled = settleGrowthEpoch(open, 1);
    expect(settled).toMatchObject({ inflow: 15_000_000, reference: 15_000_000, budget: 15_000_000, escrowAdded: 0, forfeited: true });
    expect(open.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);

    const left = createPool();
    const right = createPool();
    left.chain[0]!.header.height = GROWTH_EPOCH_LENGTH - 1;
    right.chain[0]!.header.height = GROWTH_EPOCH_LENGTH - 1;
    const block = await buildBlock(left, "bootstrap-validator", DEFAULT_CONFIG);
    expect(block.header.height).toBe(GROWTH_EPOCH_LENGTH);
    expect(left.growthSettledEpochs[1]).toBe(true);
    expect(await tryApplyRemoteBlock(right, block, DEFAULT_CONFIG)).toBe(true);
    expect(right.growthSettledEpochs[1]).toBe(true);
    expect(computeStateRoot(left)).toBe(computeStateRoot(right));

    const victim = createPool();
    victim.chain[0]!.header.height = GROWTH_EPOCH_LENGTH - 1;
    const bad = structuredClone(block);
    bad.header.stateRoot = "ab".repeat(32);
    bad.hash = hashJson({ header: bad.header, transactions: bad.transactions });
    expect(await tryApplyRemoteBlock(victim, bad, DEFAULT_CONFIG)).toBe(false);
    expect(victim.growthSettledEpochs).toEqual({});
    expect(victim.growthPool.escrow).toBe(0);
    expect(victim.epoch).toBe(0);
  });
});

describe("Beta Growth referral weights 70/30", () => {
  test("L1-only uses weight 70 of the active unit", async () => {
    expect(growthPayableWeight(1)).toBe(70);
    expect(growthRawAmount(10_000, GROWTH_L1_WEIGHT, GROWTH_L1_WEIGHT)).toBe(10_000);
    expect(growthRawAmount(10_000, GROWTH_L1_WEIGHT, 2 * GROWTH_L1_WEIGHT)).toBe(5_000);

    const state = createPool();
    for (let epoch = 1; epoch <= 5; epoch += 1) {
      creditInflow(state, epoch, 1_000_000);
    }
    for (let index = 0; index < 100; index += 1) {
      const parent = 10_000 + index;
      const child = 20_000 + index;
      put(state, addr(parent));
      put(state, addr(child), addr(parent));
      mark(state, addr(child), 4, 4);
    }
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const settled = settleGrowthEpoch(state, 6);
    expect(settled.budget).toBe(1_000_000);
    const claims = Object.values(state.growthClaims);
    expect(claims).toHaveLength(100);
    expect(claims.every((claim) => claim.level === 1)).toBe(true);
    const raw = growthRawAmount(settled.budget, GROWTH_L1_WEIGHT, 100 * GROWTH_L1_WEIGHT);
    expect(raw).toBe(10_000);
    expect(claims.every((claim) => claim.amount === raw)).toBe(true);
    expect(settled.escrowAdded).toBe(1_000_000);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
  });

  test("L2-only uses weight 30 of the active unit", async () => {
    expect(growthPayableWeight(2)).toBe(30);
    expect(growthRawAmount(10_000, GROWTH_L2_WEIGHT, GROWTH_L2_WEIGHT)).toBe(10_000);
    expect(growthRawAmount(10_000, GROWTH_L2_WEIGHT, GROWTH_ACTIVE_WEIGHT_SUM)).toBe(3_000);
    expect(growthRawAmount(10_000, GROWTH_L2_WEIGHT, 2 * GROWTH_L2_WEIGHT)).toBe(5_000);
  });

  test("L1+L2 active weighting is exactly 70/30 before caps and rounding", async () => {
    const budget = 1_000_000;
    const weightSum = 100 * GROWTH_L1_WEIGHT + 100 * GROWTH_L2_WEIGHT;
    expect(weightSum).toBe(10_000);
    const rawL1 = growthRawAmount(budget, GROWTH_L1_WEIGHT, weightSum);
    const rawL2 = growthRawAmount(budget, GROWTH_L2_WEIGHT, weightSum);
    expect(rawL1).toBe(7_000);
    expect(rawL2).toBe(3_000);
    expect(rawL1 + rawL2).toBe(10_000);
    expect(rawL1 * weightSum).toBe(budget * GROWTH_L1_WEIGHT);
    expect(rawL2 * weightSum).toBe(budget * GROWTH_L2_WEIGHT);

    const state = createPool();
    for (let epoch = 1; epoch <= 5; epoch += 1) {
      creditInflow(state, epoch, 1_000_000);
    }
    for (let index = 0; index < 100; index += 1) {
      const root = 1_000_000 + index;
      const mid = 2_000_000 + index;
      const leaf = 3_000_000 + index;
      put(state, addr(root));
      put(state, addr(mid), addr(root));
      put(state, addr(leaf), addr(mid));
      mark(state, addr(leaf), 5, 6);
    }
    const settled = settleGrowthEpoch(state, 6);
    expect(settled.budget).toBe(budget);
    const claims = Object.values(state.growthClaims);
    const l1 = claims.filter((claim) => claim.level === 1);
    const l2 = claims.filter((claim) => claim.level === 2);
    expect(l1).toHaveLength(100);
    expect(l2).toHaveLength(100);
    expect(l1.every((claim) => claim.amount === rawL1)).toBe(true);
    expect(l2.every((claim) => claim.amount === rawL2)).toBe(true);
    expect(settled.escrowAdded).toBe(1_000_000);
  });

  test("settlement pays only L1/L2 referrers even if a deeper parent chain is forced into state", async () => {
    // Graph writes normally reject depth > 2; this injects a deeper chain to prove
    // collectTuples only walks parent (L1) and grandparent (L2).
    const state = createPool();
    for (let epoch = 1; epoch <= 5; epoch += 1) {
      creditInflow(state, epoch, 10_000);
    }
    put(state, addr(1));
    put(state, addr(2), addr(1));
    put(state, addr(3), addr(2));
    put(state, addr(4), addr(3));
    put(state, addr(5), addr(4));
    put(state, addr(6), addr(5));
    for (let node = 2; node <= 6; node += 1) {
      mark(state, addr(node), 5, 6);
    }
    settleGrowthEpoch(state, 6);
    const claims = Object.values(state.growthClaims);
    const leaf = addr(6);
    expect(growthPayableWeight(3)).toBe(0);
    expect(growthPayableWeight(4)).toBe(0);
    expect(growthPayableWeight(5)).toBe(0);
    expect(claims.every((claim) => claim.level === 1 || claim.level === 2)).toBe(true);
    expect(claims.filter((claim) => claim.referred === leaf).map((claim) => claim.referrer).sort()).toEqual(
      [addr(4), addr(5)].sort()
    );
    expect(claims.filter((claim) => claim.referred === leaf && claim.referrer === addr(3))).toEqual([]);
    expect(claims.filter((claim) => claim.referred === leaf && claim.referrer === addr(2))).toEqual([]);
    expect(claims.filter((claim) => claim.referred === leaf && claim.referrer === addr(1))).toEqual([]);
  });

  test("total allocated never exceeds the Growth Pool budget", async () => {
    const state = qualifiedReferrer(4, [2, 3, 4, 5, 6]);
    const settled = settleGrowthEpoch(state, 4);
    expect(settled.escrowAdded).toBeLessThanOrEqual(settled.budget);
    expect(state.growthPool.escrow).toBe(settled.escrowAdded);
    expect(growthPoolAvailable(state.growthPool) + state.growthPool.escrow).toBe(state.growthPool.totalInflow);
  });

  test("settlement does not create new PPL units", async () => {
    const state = qualifiedReferrer(4, [2, 3]);
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const faucet = state.accounts[FAUCET_ADDRESS]!.balance;
    settleGrowthEpoch(state, 4);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.accounts[FAUCET_ADDRESS]!.balance).toBe(faucet);
    expect(supply).toBe(GENESIS_FAUCET_BALANCE);
  });

  test("the referrer cap is still enforced", async () => {
    const state = createPool();
    for (let epoch = 1; epoch <= 7; epoch += 1) {
      creditInflow(state, epoch, 1000);
      state.growthEpochBudget[epoch] = 100_000;
    }
    put(state, addr(1));
    for (let child = 2; child <= 7; child += 1) {
      put(state, addr(child), addr(1));
      mark(state, addr(child), 5, 6);
    }
    const settled = settleGrowthEpoch(state, 8);
    expect(settled.budget).toBe(1000);
    const referrerCap = Math.floor((settled.budget * GROWTH_REFERRER_CAP_PERCENT) / 100);
    expect(state.growthAssigned[8]?.[addr(1)]).toBeLessThanOrEqual(referrerCap);
    expect(state.growthPool.escrow).toBe(48);
  });

  test("the edge cap is still enforced", async () => {
    const state = qualifiedReferrer(4, [2]);
    const settled = settleGrowthEpoch(state, 4);
    const edgeCap = Math.floor((settled.budget * GROWTH_EDGE_CAP_PERCENT) / 100);
    const amount = state.growthClaims[growthClaimKey(4, addr(1), addr(2), 1)]!.amount;
    expect(amount).toBeLessThanOrEqual(edgeCap);
    expect(amount).toBe(edgeCap);
  });

  test("the long-window cap is still enforced", async () => {
    const state = qualifiedReferrer(4, [2]);
    state.growthAssigned[1] = { [addr(1)]: 20 };
    const settled = settleGrowthEpoch(state, 4);
    expect(GROWTH_WINDOW_CAP_PERCENT).toBe(2);
    expect(settled.escrowAdded).toBe(0);
    expect(state.growthClaims).toEqual({});
  });

  test("qualification still depends on actual activity", async () => {
    const idle = createPool();
    for (let epoch = 1; epoch <= 3; epoch += 1) {
      creditInflow(idle, epoch, 1000);
    }
    put(idle, addr(1));
    put(idle, addr(2), addr(1));
    const settled = settleGrowthEpoch(idle, 4);
    expect(settled.forfeited).toBe(true);
    expect(idle.growthClaims).toEqual({});

    const active = qualifiedReferrer(4, [2]);
    settleGrowthEpoch(active, 4);
    expect(Object.keys(active.growthClaims).length).toBeGreaterThan(0);
  });

  test("maturation remains deterministic", async () => {
    const late = createPool();
    for (let epoch = 1; epoch <= 3; epoch += 1) {
      creditInflow(late, epoch, 1000);
    }
    put(late, addr(1));
    late.participants[addr(2)] = {
      address: addr(2),
      parent: addr(1),
      linkedAtHeight: GROWTH_EPOCH_LENGTH * 4,
      registeredAtHeight: 1
    };
    mark(late, addr(2), 4, 4);
    const snapshotHeight = GROWTH_EPOCH_LENGTH * 4;
    expect(referralMaturedAt(GROWTH_EPOCH_LENGTH * 4, snapshotHeight)).toBe(false);
    const first = settleGrowthEpoch(late, 4);
    expect(first.forfeited).toBe(true);
    expect(late.growthClaims).toEqual({});

    const ready = qualifiedReferrer(4, [2]);
    const copy = qualifiedReferrer(4, [2]);
    settleGrowthEpoch(ready, 4);
    settleGrowthEpoch(copy, 4);
    expect(JSON.stringify(ready.growthClaims)).toBe(JSON.stringify(copy.growthClaims));
  });

  test("empty and no-budget cases follow existing FORFEIT rules", async () => {
    const empty = createPool();
    const settled = settleGrowthEpoch(empty, 1);
    expect(settled).toMatchObject({ budget: 0, escrowAdded: 0, forfeited: true });
    expect(empty.growthClaims).toEqual({});
  });

  test("insufficient budget creates no debt and does not mint", async () => {
    const state = qualifiedReferrer(4, [2]);
    state.growthPool.totalInflow = 200;
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const settled = settleGrowthEpoch(state, 4);
    expect(settled.budget).toBe(200);
    expect(settled.escrowAdded).toBeLessThanOrEqual(settled.budget);
    expect(settled.escrowAdded).toBeGreaterThanOrEqual(0);
    expect(state.growthPool.escrow).toBe(settled.escrowAdded);
    expect(growthPoolAvailable(state.growthPool)).toBe(200 - settled.escrowAdded);
    expect(state.growthPool.escrow + growthPoolAvailable(state.growthPool)).toBe(state.growthPool.totalInflow);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.accounts[addr(1)]).toBeUndefined();
  });

  test("Claim D expiry still returns unclaimed escrow to the Growth Pool", async () => {
    const state = qualifiedReferrer(4, [2]);
    settleGrowthEpoch(state, 4);
    const key = growthClaimKey(4, addr(1), addr(2), 1);
    const amount = state.growthClaims[key]!.amount;
    const assigned = state.growthAssigned[4]![addr(1)];
    state.contributionEpochs = {};
    state.networkActivityEpochs = {};
    const settled = settleGrowthEpoch(state, 4 + GROWTH_CLAIM_EXPIRY_EPOCHS);
    expect(settled.escrowAdded).toBe(0);
    expect(state.growthClaims[key]!.status).toBe("returned");
    expect(state.growthPool.escrow).toBe(0);
    expect(state.growthPool.totalReturned).toBe(amount);
    expect(state.growthAssigned[4]![addr(1)]).toBe(assigned);
    expect(state.accounts[addr(1)]).toBeUndefined();
  });

  test("settlement is deterministic and a repeat is rejected", async () => {
    const left = qualifiedReferrer(4, [4, 2, 3]);
    const right = qualifiedReferrer(4, [2, 3, 4]);
    const first = settleGrowthEpoch(left, 4);
    const second = settleGrowthEpoch(right, 4);
    expect(first).toEqual(second);
    expect(JSON.stringify(left.growthClaims)).toBe(JSON.stringify(right.growthClaims));
    expect(() => settleGrowthEpoch(left, 4)).toThrow(/Growth epoch already settled/);
    expect(left.growthPool.escrow).toBe(first.escrowAdded);
  });

  test("Model A fee split and Growth Pool 15% are unchanged", async () => {
    expect(APPROVED_MODEL_A_SHARES).toEqual({
      validatorShare: 30,
      communityShare: 25,
      treasuryShare: 20,
      liquidityShare: 10,
      growthShare: 15,
      burnShare: 0
    });
  });
});

function createPool(): ChainState {
  return createInitialState();
}

function qualifiedReferrer(epoch: number, children: number[]): ChainState {
  const state = createPool();
  for (let cursor = 1; cursor < epoch; cursor += 1) {
    creditInflow(state, cursor, 1000);
  }
  put(state, addr(1));
  for (const child of children) {
    put(state, addr(child), addr(1));
    mark(state, addr(child), 4, 4);
  }
  return state;
}
