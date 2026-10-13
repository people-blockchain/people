import { describe, expect, test } from "vitest";
import {
  APPROVED_MODEL_A_SHARES,
  DEFAULT_CONFIG,
  DEV_FAUCET_PRIVATE_KEY,
  ELIGIBLE_GROWTH_FEE_SOURCES,
  FAUCET_ADDRESS,
  GROWTH_FEE_SPLIT_ACTIVE,
  INELIGIBLE_GROWTH_AMOUNT_SOURCES,
  NATIVE_ASSET_ID,
  PROVISIONAL_FEE_SPLIT,
  assertGrowthPoolConservation,
  buildBlock,
  calculateApprovedFeeSplit,
  computeStateRoot,
  createGrowthPoolState,
  createInitialState,
  creditEligibleFeeBase,
  creditGrowthPool,
  distributeEpochRewards,
  enqueueTransaction,
  ensureAccount,
  generateKeyPair,
  growthFeeSplitSwitch,
  growthPoolAvailable,
  growthPoolTotalDebited,
  listEligibleFeeComponents,
  routeTradingFee,
  signTransaction,
  txFeeUsesLiveModelA,
  type GrowthPoolState
} from "./index.js";

const ON = { active: true } as const;

function activeValidator(address: string) {
  return {
    address,
    nodeKind: "full" as const,
    status: "active" as const,
    stake: 100,
    uptimeScore: 1,
    attestationScore: 1,
    lastSeen: 1_700_000_000_000,
    joinedAtEpoch: 0
  };
}

function expectSplitConserves(fee: number): void {
  const split = calculateApprovedFeeSplit(fee, ON);
  expect(split.active).toBe(true);
  expect(
    split.validatorAmount +
      split.communityAmount +
      split.treasuryAmount +
      split.liquidityAmount +
      split.growthAmount +
      split.burnAmount
  ).toBe(fee);
  expect(split.total).toBe(fee);
  expect(split.burnAmount).toBe(0);
  expect(split.growthAmount).toBe(Number((BigInt(fee) * 15n) / 100n));
}

describe("growth pool accounting", () => {
  test("approved shares match Model A and sum to 100", async () => {
    expect(APPROVED_MODEL_A_SHARES).toEqual({
      validatorShare: 30,
      communityShare: 25,
      treasuryShare: 20,
      liquidityShare: 10,
      growthShare: 15,
      burnShare: 0
    });
    expect(GROWTH_FEE_SPLIT_ACTIVE).toBe(true);
    expect(growthFeeSplitSwitch()).toEqual({ active: true });
    expect(calculateApprovedFeeSplit(100)).toMatchObject({
      active: true,
      validatorAmount: 30,
      communityAmount: 25,
      treasuryAmount: 20,
      liquidityAmount: 10,
      growthAmount: 15,
      burnAmount: 0
    });
  });

  test("the live default credits growth and an explicit off switch is not the block path", async () => {
    const pool = createGrowthPoolState();
    expect(creditGrowthPool(pool, "transfer_fee", 100)).toBe(15);
    expect(pool.totalInflow).toBe(15);
    expect(creditGrowthPool(pool, "transfer_fee", 100, { active: false })).toBe(0);
    expect(pool.totalInflow).toBe(15);
    expect(calculateApprovedFeeSplit(100, { active: false }).growthAmount).toBe(0);
  });

  test("integer floor split leaves the remainder with validators", async () => {
    expectSplitConserves(0);
    expectSplitConserves(1);
    expectSplitConserves(6);
    expectSplitConserves(7);
    expectSplitConserves(99);
    expectSplitConserves(100);
    expect(calculateApprovedFeeSplit(1, ON).growthAmount).toBe(0);
    expect(calculateApprovedFeeSplit(1, ON).validatorAmount).toBe(1);
    expect(calculateApprovedFeeSplit(100, ON)).toMatchObject({
      validatorAmount: 30,
      communityAmount: 25,
      treasuryAmount: 20,
      liquidityAmount: 10,
      growthAmount: 15,
      burnAmount: 0
    });
    expect(calculateApprovedFeeSplit(7, ON)).toMatchObject({
      validatorAmount: 4,
      communityAmount: 1,
      treasuryAmount: 1,
      liquidityAmount: 0,
      growthAmount: 1,
      burnAmount: 0
    });
  });

  test("rejects non-integers and does not use a float fee path", async () => {
    const pool = createGrowthPoolState();
    expect(() => calculateApprovedFeeSplit(0.1)).toThrow(/safe integer/);
    expect(() => creditGrowthPool(pool, "transfer_fee", 0.1, ON)).toThrow(/safe integer/);
    expect(() => listEligibleFeeComponents({ txType: "transfer", txFee: 0.1 })).toThrow(/safe integer/);
    expect(pool.totalInflow).toBe(0);
  });

  test("credits only the closed eligible set, once, and only while the switch is on", async () => {
    const pool = createGrowthPoolState();
    expect(creditEligibleFeeBase(pool, { txType: "transfer", txFee: 100, principal: 500 }, ON)).toBe(15);
    expect(
      creditEligibleFeeBase(
        pool,
        { txType: "tokenCreate", txFee: 100, projectToken: 1_000_000 },
        ON
      )
    ).toBe(15);
    expect(creditEligibleFeeBase(pool, { txType: "joinValidator", txFee: 100, stake: 1000 }, ON)).toBe(15);
    expect(creditEligibleFeeBase(pool, { txType: "proposal", txFee: 100 }, ON)).toBe(15);
    expect(creditEligibleFeeBase(pool, { txType: "creatorClaim", txFee: 100 }, ON)).toBe(15);
    expect(
      creditEligibleFeeBase(
        pool,
        { txType: "curveBuy", txFee: 100, curveTradingFee: 200, principal: 9_000 },
        ON
      )
    ).toBe(45);
    expect(
      creditEligibleFeeBase(pool, { txType: "curveSell", txFee: 0, curveTradingFee: 100 }, ON)
    ).toBe(15);
    expect(pool.totalInflow).toBe(15 * 6 + 30 + 15);
    expect(pool.claimedSettled).toBe(0);
    expect(pool.escrow).toBe(0);
    expect(pool.totalReturned).toBe(0);
    expect(growthPoolAvailable(pool)).toBe(pool.totalInflow);

    const quiet = createGrowthPoolState();
    expect(
      creditEligibleFeeBase(
        quiet,
        {
          txType: "curveBuy",
          txFee: 100,
          curveTradingFee: 200,
          principal: 9_000
        },
        { active: false }
      )
    ).toBe(0);
    expect(quiet.totalInflow).toBe(0);
  });

  test("token launch fee is not also counted as protocol tx.fee", async () => {
    const launch = listEligibleFeeComponents({
      txType: "tokenCreate",
      txFee: 100,
      projectToken: 1_000_000
    });
    expect(launch).toEqual([{ source: "token_launch_fee", amount: 100 }]);
    const transfer = listEligibleFeeComponents({ txType: "transfer", txFee: 40, principal: 10, curveTradingFee: 5 });
    expect(transfer).toEqual([{ source: "transfer_fee", amount: 40 }]);
    expect(listEligibleFeeComponents({ txType: "curveBuy", txFee: 10, curveTradingFee: 20 })).toEqual([
      { source: "protocol_tx_fee", amount: 10 },
      { source: "curve_trading_fee", amount: 20 }
    ]);
  });

  test("ineligible amounts and non-debited tx types add no inflow", async () => {
    const pool = createGrowthPoolState();
    for (const source of INELIGIBLE_GROWTH_AMOUNT_SOURCES) {
      expect(creditGrowthPool(pool, source, 10_000, ON)).toBe(0);
    }
    const notDebited = [
      "leaveValidator",
      "unstake",
      "attestation",
      "slashEvidence",
      "vote",
      "registerParticipant",
      "participantReferral"
    ] as const;
    for (const txType of notDebited) {
      expect(creditEligibleFeeBase(pool, { txType, txFee: 50 }, ON)).toBe(0);
      expect(listEligibleFeeComponents({ txType, txFee: 50 })).toEqual([]);
    }
    expect(
      creditEligibleFeeBase(
        pool,
        {
          txType: "transfer",
          txFee: 0,
          principal: 100,
          stake: 100,
          projectToken: 100,
          nftFee: 100,
          ammSwapFee: 100,
          promotionFee: 100,
          apiFee: 100
        },
        ON
      )
    ).toBe(0);
    expect(pool.totalInflow).toBe(0);
    expect(ELIGIBLE_GROWTH_FEE_SOURCES).toEqual([
      "transfer_fee",
      "token_launch_fee",
      "protocol_tx_fee",
      "curve_trading_fee"
    ]);
  });

  test("conservation counts escrow once and does not treat a return as new inflow", async () => {
    const pool: GrowthPoolState = {
      totalInflow: 1000,
      claimedSettled: 200,
      escrow: 300,
      totalReturned: 100
    };
    expect(growthPoolTotalDebited(pool)).toBe(600);
    expect(growthPoolAvailable(pool)).toBe(500);
    expect(growthPoolAvailable(pool) + pool.escrow + pool.claimedSettled).toBe(pool.totalInflow);
    const doubleEscrow = pool.totalInflow - growthPoolTotalDebited(pool) - pool.escrow + pool.totalReturned;
    expect(doubleEscrow).toBe(200);
    expect(doubleEscrow).not.toBe(growthPoolAvailable(pool));
    assertGrowthPoolConservation(pool);
    expect(pool.totalInflow).toBe(1000);

    expect(() =>
      assertGrowthPoolConservation({
        totalInflow: 10,
        claimedSettled: 8,
        escrow: 3,
        totalReturned: 0
      })
    ).toThrow(/negative/);
  });

  test("credit does not mint, and does not touch community, treasury, burn, or validator balances", async () => {
    const state = createInitialState();
    state.validators.val1 = activeValidator("val1");
    ensureAccount(state, "val1").balance = 10;
    const root = computeStateRoot(state);
    const community = structuredClone(state.communityPool);
    const treasury = structuredClone(state.treasury);
    const burned = structuredClone(state.burned);
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const balance = state.accounts.val1!.balance;
    const pool = createGrowthPoolState();
    creditEligibleFeeBase(pool, { txType: "transfer", txFee: 100 }, ON);
    expect(pool.totalInflow).toBe(15);
    expect(growthPoolAvailable(pool)).toBe(15);
    expect(computeStateRoot(state)).toBe(root);
    expect(state.communityPool).toEqual(community);
    expect(state.treasury).toEqual(treasury);
    expect(state.burned).toEqual(burned);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.accounts.val1!.balance).toBe(balance);
    expect(pool).not.toEqual(state.communityPool);
  });

  test("a normal block splits an eligible fee and does not assign 100% to validators", async () => {
    const state = createInitialState();
    state.validators.val1 = activeValidator("val1");
    ensureAccount(state, "val1").balance = 10;
    state.accounts.val1!.balances[NATIVE_ASSET_ID] = 10;
    const supply = state.assets[NATIVE_ASSET_ID]!.totalSupply;
    const wallet = generateKeyPair();
    expect(DEFAULT_CONFIG.feeSplit).toBeUndefined();
    expect(GROWTH_FEE_SPLIT_ACTIVE).toBe(true);

    const tx = signTransaction(DEV_FAUCET_PRIVATE_KEY, {
      id: "growth-live-fee",
      from: FAUCET_ADDRESS,
      to: wallet.address,
      amount: 10,
      fee: 100,
      nonce: 0,
      timestamp: 1_700_000_000_000,
      type: "transfer"
    });
    expect(txFeeUsesLiveModelA(tx, DEFAULT_CONFIG)).toBe(true);
    enqueueTransaction(state, tx);
    const block = await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(block.transactions).toHaveLength(1);

    expect(state.growthPool.totalInflow).toBe(15_000_000);
    expect(state.growthPool.claimedSettled).toBe(0);
    expect(state.growthPool.escrow).toBe(0);
    expect(state.growthPool.totalReturned).toBe(0);
    expect(growthPoolAvailable(state.growthPool)).toBe(15_000_000);
    expect(state.communityPool.pools[NATIVE_ASSET_ID]?.remainingBalance).toBe(25);
    expect(state.treasury?.[NATIVE_ASSET_ID]).toBe(20);
    expect(state.feeLiquidityEcosystem).toBe(10_000_000);
    expect(state.burned?.[NATIVE_ASSET_ID] ?? 0).toBe(0);
    expect(state.accounts.val1!.balance).toBe(40);
    expect(25 + 20 + 10 + 15 + 0 + 30).toBe(100);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
    expect(state.contributionEpochs).toEqual({});
    expect(state.networkActivityEpochs).toEqual({});

    const beforeIssuance = state.accounts.val1!.balance;
    const reward = distributeEpochRewards(state, DEFAULT_CONFIG, 0);
    expect(reward.protocolIssuance).toBe(DEFAULT_CONFIG.epochBaseIssuance);
    expect(reward.feeReward).toBe(0);
    expect(reward.totalReward).toBe(DEFAULT_CONFIG.epochBaseIssuance);
    expect(state.accounts.val1!.balance).toBe(beforeIssuance + DEFAULT_CONFIG.epochBaseIssuance);
    expect(state.growthPool.totalInflow).toBe(15_000_000);

    const dust = signTransaction(DEV_FAUCET_PRIVATE_KEY, {
      id: "growth-dust-fee",
      from: FAUCET_ADDRESS,
      to: wallet.address,
      amount: 1,
      fee: 7,
      nonce: 1,
      timestamp: 1_700_000_000_000,
      type: "transfer"
    });
    enqueueTransaction(state, dust);
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(state.growthPool.totalInflow).toBe(16_050_000);
    expect(state.communityPool.pools[NATIVE_ASSET_ID]?.remainingBalance).toBe(26.75);
    expect(state.treasury?.[NATIVE_ASSET_ID]).toBe(21.4);
    expect(state.feeLiquidityEcosystem).toBe(10_700_000);
    expect(state.accounts.val1!.balance).toBe(beforeIssuance + DEFAULT_CONFIG.epochBaseIssuance + 2.1);
    expect(state.assets[NATIVE_ASSET_ID]!.totalSupply).toBe(supply);
  });

  test("fractional fees enter Growth Pool; an explicit non-legacy split remains separate", async () => {
    const state = createInitialState();
    state.validators.val1 = activeValidator("val1");
    ensureAccount(state, "val1").balance = 0;
    const wallet = generateKeyPair();
    const fractional = signTransaction(DEV_FAUCET_PRIVATE_KEY, {
      id: "fractional-fee",
      from: FAUCET_ADDRESS,
      to: wallet.address,
      amount: 1,
      fee: 0.1,
      nonce: 0,
      timestamp: 1_700_000_000_000,
      type: "transfer"
    });
    expect(txFeeUsesLiveModelA(fractional, DEFAULT_CONFIG)).toBe(true);
    enqueueTransaction(state, fractional);
    await buildBlock(state, "bootstrap-validator", DEFAULT_CONFIG);
    expect(state.growthPool.totalInflow).toBe(15_000);
    expect(state.accounts.val1!.balance).toBe(0.03);

    const trading = routeTradingFee(state, 80, { ...DEFAULT_CONFIG, feeSplit: PROVISIONAL_FEE_SPLIT });
    expect(trading.growthAmount ?? 0).toBe(0);
    expect(trading.validatorAmount).toBe(32);
    expect(state.growthPool.totalInflow).toBe(15_000);
    expect(state.accounts.val1!.balance).toBe(32.03);
  });

  test("live routing does not open a claim or a payout", async () => {
    const state = createInitialState();
    routeTradingFee(state, 100, DEFAULT_CONFIG);
    expect(state.growthPool).toEqual({
      totalInflow: 15_000_000,
      totalReturned: 0,
      claimedSettled: 0,
      escrow: 0
    });
    expect(state.growthPool).not.toHaveProperty("claimable");
    expect(state).not.toHaveProperty("claims");
  });
});
