import { describe, expect, test } from "vitest";
import type { LiquidityPoolState } from "@people/protocol";
import {
  AMM_FEE_BPS,
  AMM_MINIMUM_LIQUIDITY,
  DEFAULT_CONFIG,
  DEFAULT_TRANSFER_FEE,
  NATIVE_ASSET_ID,
  applyTransaction,
  bootstrapLpShares,
  calculateAddLiquidity,
  calculateAmmSwapExactIn,
  calculateApprovedFeeSplit,
  calculateRemoveLiquidity,
  computeStateRoot,
  createInitialState,
  ensureAccount,
  executeMigration,
  generateKeyPair,
  integerSqrt,
  listEligibleFeeComponents,
  nativeLiquidityPoolId,
  pplToAtoms,
  quoteAmmSwap,
  registerAsset,
  setAccountBalance,
  signTransaction
} from "./index.js";

const TOKEN = "gold";

function fundedUser(balance = 1_000_000, tokens = 500_000) {
  const state = createInitialState();
  const user = generateKeyPair();
  const account = ensureAccount(state, user.address);
  account.balance = balance;
  account.balances[NATIVE_ASSET_ID] = balance;
  registerAsset(state, {
    assetId: TOKEN,
    type: "user",
    name: "Gold",
    symbol: "GOLD",
    decimals: 6,
    totalSupply: tokens * 2,
    creator: user.address,
    status: "active"
  });
  setAccountBalance(account, TOKEN, tokens);
  return { state, user };
}

function signedAmm(
  privateKey: string,
  from: string,
  type: "ammCreatePool" | "ammAddLiquidity" | "ammRemoveLiquidity" | "ammSwap",
  nonce: number,
  payload: Record<string, unknown>,
  amount = 0,
  fee = DEFAULT_TRANSFER_FEE
) {
  return signTransaction(privateKey, {
    chainId: DEFAULT_CONFIG.chainId,
    id: `${from}-${type}-${nonce}`,
    from,
    to: "amm",
    amount,
    fee,
    nonce,
    timestamp: 1,
    type,
    payload
  });
}

describe("AMM integer math", () => {
  test("integerSqrt is floor of real sqrt", () => {
    expect(integerSqrt(0n)).toBe(0n);
    expect(integerSqrt(1n)).toBe(1n);
    expect(integerSqrt(3n)).toBe(1n);
    expect(integerSqrt(4n)).toBe(2n);
    expect(integerSqrt(1_000_000n)).toBe(1000n);
    expect(integerSqrt(1_000_001n)).toBe(1000n);
  });

  test("exact-in swap keeps k non-decreasing and rounds in the pool's favor", () => {
    const reserveIn = 1_000_000;
    const reserveOut = 2_000_000;
    const amountIn = 10_000;
    const kBefore = BigInt(reserveIn) * BigInt(reserveOut);
    const result = calculateAmmSwapExactIn(reserveIn, reserveOut, amountIn, AMM_FEE_BPS, 0);
    const kAfter = BigInt(result.newReserveIn) * BigInt(result.newReserveOut);
    expect(kAfter >= kBefore).toBe(true);
    expect(result.newReserveIn).toBe(reserveIn + amountIn);
    expect(result.amountOut).toBeLessThan(reserveOut);
    expect(result.lpFee).toBe(Number((BigInt(amountIn) * 30n) / 10_000n));

    const dx = BigInt(amountIn);
    const rIn = BigInt(reserveIn);
    const rOut = BigInt(reserveOut);
    const ceiled = (dx * 9970n * rOut + (rIn * 10_000n + dx * 9970n - 1n)) / (rIn * 10_000n + dx * 9970n);
    expect(BigInt(result.amountOut) < ceiled || BigInt(result.amountOut) === (dx * 9970n * rOut) / (rIn * 10_000n + dx * 9970n)).toBe(
      true
    );
    expect(result.amountOut).toBe(Number((dx * 9970n * rOut) / (rIn * 10_000n + dx * 9970n)));
  });

  test("zero-fee swap still floors output so k does not fall", () => {
    const result = calculateAmmSwapExactIn(10_000, 10_000, 100, 0, 0);
    expect(result.amountOut).toBeGreaterThan(0);
    expect(result.lpFee).toBe(0);
    expect(BigInt(result.newReserveIn) * BigInt(result.newReserveOut) >= 10_000n * 10_000n).toBe(true);
  });

  test("slippage guard rejects too-low minOut", () => {
    expect(() => calculateAmmSwapExactIn(1_000, 1_000, 10, AMM_FEE_BPS, 1_000_000)).toThrow(/Slippage/);
  });

  test("rejects zero, same-side drain, and overflow", () => {
    expect(() => calculateAmmSwapExactIn(0, 100, 1, AMM_FEE_BPS)).toThrow(/positive/);
    expect(() => calculateAmmSwapExactIn(100, 100, 0, AMM_FEE_BPS)).toThrow(/positive/);
    expect(() => calculateAmmSwapExactIn(100, 1, 10_000_000, AMM_FEE_BPS)).toThrow(/drain|zero/i);
    expect(() =>
      calculateAmmSwapExactIn(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 2, AMM_FEE_BPS)
    ).toThrow(/MAX_SAFE_INTEGER|drain|zero/i);
  });

  test("first LP mint locks MINIMUM_LIQUIDITY and uses integer sqrt", () => {
    const pool: LiquidityPoolState = {
      poolId: "pool-ppl-gold",
      tokenAssetId: TOKEN,
      nativeAssetId: NATIVE_ASSET_ID,
      tokenReserve: 0,
      nativeReserve: 0,
      feeBps: AMM_FEE_BPS,
      status: "active",
      locked: false,
      createdAt: 0
    };
    const tokenAmount = 1_000_000;
    const nativeAmount = 4_000_000;
    const mint = calculateAddLiquidity(pool, tokenAmount, nativeAmount, 0);
    const raw = integerSqrt(BigInt(tokenAmount) * BigInt(nativeAmount));
    expect(mint.lockedLpSupply).toBe(AMM_MINIMUM_LIQUIDITY);
    expect(mint.lpMinted).toBe(Number(raw) - AMM_MINIMUM_LIQUIDITY);
    expect(mint.newTotalLpSupply).toBe(Number(raw));
    expect(() => calculateAddLiquidity(pool, 10, 10, 0)).toThrow(/Insufficient initial liquidity/);
  });

  test("proportional mint takes the min of both sides (floor)", () => {
    const pool: LiquidityPoolState = {
      poolId: "pool-ppl-gold",
      tokenAssetId: TOKEN,
      nativeAssetId: NATIVE_ASSET_ID,
      tokenReserve: 1000,
      nativeReserve: 2000,
      feeBps: AMM_FEE_BPS,
      status: "active",
      locked: false,
      createdAt: 0,
      totalLpSupply: 1000,
      lockedLpSupply: AMM_MINIMUM_LIQUIDITY,
      lpBalances: {}
    };
    const mint = calculateAddLiquidity(pool, 100, 300, 0);
    const fromToken = Number((100n * 1000n) / 1000n);
    const fromNative = Number((300n * 1000n) / 2000n);
    expect(mint.lpMinted).toBe(Math.min(fromToken, fromNative));
    expect(mint.lpMinted).toBe(100);
  });

  test("remove liquidity returns floor shares and cannot burn the lock", () => {
    const pool: LiquidityPoolState = {
      poolId: "pool-ppl-gold",
      tokenAssetId: TOKEN,
      nativeAssetId: NATIVE_ASSET_ID,
      tokenReserve: 10_000,
      nativeReserve: 20_000,
      feeBps: AMM_FEE_BPS,
      status: "active",
      locked: false,
      createdAt: 0,
      totalLpSupply: 5_000,
      lockedLpSupply: AMM_MINIMUM_LIQUIDITY,
      lpBalances: { "0xabc": 4_000 }
    };
    const burn = calculateRemoveLiquidity(pool, 1_000, 0, 0);
    expect(burn.tokenOut).toBe(Number((1000n * 10_000n) / 5_000n));
    expect(burn.nativeOut).toBe(Number((1000n * 20_000n) / 5_000n));
    expect(() => calculateRemoveLiquidity(pool, 4_001, 0, 0)).toThrow(/locked liquidity/);
  });
});

describe("AMM transactions", () => {
  test("create pool mints LP, swap moves reserves, remove returns assets", () => {
    const { state, user } = fundedUser();
    const beforeRoot = computeStateRoot(state);
    applyTransaction(
      state,
      signedAmm(user.privateKey, user.address, "ammCreatePool", 0, {
        tokenAssetId: TOKEN,
        tokenAmount: 100_000,
        nativeAmount: 50_000
      }),
      DEFAULT_CONFIG
    );
    const poolId = nativeLiquidityPoolId(TOKEN);
    const pool = state.liquidityPools[poolId]!;
    expect(pool.tokenReserve).toBe(100_000);
    expect(pool.nativeReserve).toBe(50_000);
    expect(pool.lpBalances?.[user.address]).toBeGreaterThan(0);
    expect(pool.lockedLpSupply).toBe(AMM_MINIMUM_LIQUIDITY);
    expect(computeStateRoot(state)).not.toBe(beforeRoot);

    const tokenBefore = state.accounts[user.address]!.balances[TOKEN]!;
    applyTransaction(
      state,
      signedAmm(
        user.privateKey,
        user.address,
        "ammSwap",
        1,
        { tokenAssetId: TOKEN, tokenIn: NATIVE_ASSET_ID, tokenOut: TOKEN, amountIn: 1_000, minAmountOut: 1 },
        1_000
      ),
      DEFAULT_CONFIG
    );
    expect(state.liquidityPools[poolId]!.nativeReserve).toBe(51_000);
    expect(state.accounts[user.address]!.balances[TOKEN]!).toBeGreaterThan(tokenBefore);

    const lp = state.liquidityPools[poolId]!.lpBalances![user.address]!;
    applyTransaction(
      state,
      signedAmm(user.privateKey, user.address, "ammRemoveLiquidity", 2, {
        tokenAssetId: TOKEN,
        lpAmount: Math.floor(lp / 2),
        minTokenOut: 1,
        minNativeOut: 1
      }),
      DEFAULT_CONFIG
    );
    expect(state.liquidityPools[poolId]!.lpBalances![user.address]).toBe(lp - Math.floor(lp / 2));
  });

  test("swap LP fee stays in the pool and is not Growth-eligible; tx.fee follows Model A", () => {
    const { state, user } = fundedUser();
    applyTransaction(
      state,
      signedAmm(user.privateKey, user.address, "ammCreatePool", 0, {
        tokenAssetId: TOKEN,
        tokenAmount: 100_000,
        nativeAmount: 50_000
      }),
      DEFAULT_CONFIG
    );
    const growthBefore = state.growthPool.totalInflow;
    const kBefore =
      BigInt(state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!.tokenReserve) *
      BigInt(state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!.nativeReserve);
    const components = listEligibleFeeComponents({
      txType: "ammSwap",
      txFee: pplToAtoms(DEFAULT_TRANSFER_FEE),
      ammSwapFee: 30
    });
    expect(components).toEqual([{ source: "protocol_tx_fee", amount: pplToAtoms(DEFAULT_TRANSFER_FEE) }]);
    expect(listEligibleFeeComponents({ txType: "ammSwap", txFee: 0, ammSwapFee: 999 }).length).toBe(0);

    applyTransaction(
      state,
      signedAmm(
        user.privateKey,
        user.address,
        "ammSwap",
        1,
        { tokenAssetId: TOKEN, tokenIn: NATIVE_ASSET_ID, tokenOut: TOKEN, amountIn: 5_000, minAmountOut: 1 },
        5_000
      ),
      DEFAULT_CONFIG
    );
    const pool = state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!;
    const kAfter = BigInt(pool.tokenReserve) * BigInt(pool.nativeReserve);
    expect(kAfter > kBefore).toBe(true);
    const expectedGrowth = calculateApprovedFeeSplit(pplToAtoms(DEFAULT_TRANSFER_FEE)).growthAmount;
    expect(state.growthPool.totalInflow - growthBefore).toBe(expectedGrowth);
  });

  test("replay and nonce rules match existing txs", () => {
    const { state, user } = fundedUser();
    const tx = signedAmm(user.privateKey, user.address, "ammCreatePool", 0, {
      tokenAssetId: TOKEN,
      tokenAmount: 20_000,
      nativeAmount: 20_000
    });
    applyTransaction(state, tx, DEFAULT_CONFIG);
    expect(() => applyTransaction(state, tx, DEFAULT_CONFIG)).toThrow(/nonce/i);
    expect(() =>
      applyTransaction(
        state,
        signedAmm(user.privateKey, user.address, "ammAddLiquidity", 0, {
          tokenAssetId: TOKEN,
          tokenAmount: 1_000,
          nativeAmount: 1_000
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/nonce/i);
  });

  test("migrated locked pool can swap without rewriting historical LP fields; add bootstraps lock", () => {
    const { state, user } = fundedUser();
    const poolId = nativeLiquidityPoolId(TOKEN);
    state.liquidityPools[poolId] = {
      poolId,
      tokenAssetId: TOKEN,
      nativeAssetId: NATIVE_ASSET_ID,
      tokenReserve: 80_000,
      nativeReserve: 40_000,
      feeBps: AMM_FEE_BPS,
      status: "active",
      locked: true,
      createdAt: 1
    };
    const rootBefore = computeStateRoot(state);
    expect("totalLpSupply" in state.liquidityPools[poolId]!).toBe(false);

    applyTransaction(
      state,
      signedAmm(
        user.privateKey,
        user.address,
        "ammSwap",
        0,
        { tokenAssetId: TOKEN, tokenIn: TOKEN, tokenOut: NATIVE_ASSET_ID, amountIn: 1_000, minAmountOut: 1 },
        1_000
      ),
      DEFAULT_CONFIG
    );
    expect(state.liquidityPools[poolId]!.tokenReserve).toBe(81_000);
    expect(state.liquidityPools[poolId]!.totalLpSupply).toBeUndefined();
    expect(computeStateRoot(state)).not.toBe(rootBefore);

    applyTransaction(
      state,
      signedAmm(user.privateKey, user.address, "ammAddLiquidity", 1, {
        tokenAssetId: TOKEN,
        tokenAmount: 8_000,
        nativeAmount: 4_000
      }),
      DEFAULT_CONFIG
    );
    const pool = state.liquidityPools[poolId]!;
    expect(pool.lockedLpSupply).toBeGreaterThan(0);
    expect(pool.lpBalances?.[user.address]).toBeGreaterThan(0);
    const userLp = pool.lpBalances![user.address]!;
    expect(() =>
      applyTransaction(
        state,
        signedAmm(user.privateKey, user.address, "ammRemoveLiquidity", 2, {
          tokenAssetId: TOKEN,
          lpAmount: userLp + (pool.lockedLpSupply ?? 0)
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/Insufficient LP|locked liquidity/);
  });

  test("quote matches apply output and executeMigration still omits LP fields", () => {
    const { state, user } = fundedUser();
    applyTransaction(
      state,
      signedAmm(user.privateKey, user.address, "ammCreatePool", 0, {
        tokenAssetId: TOKEN,
        tokenAmount: 90_000,
        nativeAmount: 30_000
      }),
      DEFAULT_CONFIG
    );
    const poolId = nativeLiquidityPoolId(TOKEN);
    const quote = quoteAmmSwap(state, poolId, NATIVE_ASSET_ID, 300, TOKEN);
    const snapshot = structuredClone(state.liquidityPools[poolId]!);
    applyTransaction(
      state,
      signedAmm(
        user.privateKey,
        user.address,
        "ammSwap",
        1,
        { tokenAssetId: TOKEN, tokenIn: NATIVE_ASSET_ID, tokenOut: TOKEN, amountIn: 300, minAmountOut: quote.amountOut },
        300
      ),
      DEFAULT_CONFIG
    );
    expect(state.liquidityPools[poolId]!.tokenReserve).toBe(snapshot.tokenReserve - quote.amountOut);
    expect(state.liquidityPools[poolId]!.nativeReserve).toBe(snapshot.nativeReserve + 300);

    const migrated = createInitialState();
    migrated.curves[TOKEN] = {
      assetId: TOKEN,
      initialCurveAllocation: 600,
      currentTokenReserve: 200,
      virtualTokenReserve: 200,
      virtualNativeReserve: 180,
      actualNativeReserve: 120,
      invariantK: String(600n * 60n),
      initialPriceReference: 1,
      status: "active",
      migrationThreshold: 200
    };
    migrated.liquidityReserves[TOKEN] = 100;
    executeMigration(migrated, TOKEN, 9);
    const migratedPool = migrated.liquidityPools[nativeLiquidityPoolId(TOKEN)]!;
    expect(migratedPool.locked).toBe(true);
    expect(migratedPool.totalLpSupply).toBeUndefined();
    expect(migratedPool.lpBalances).toBeUndefined();
    expect(Object.keys(migratedPool).sort()).toEqual(
      ["createdAt", "feeBps", "locked", "nativeAssetId", "nativeReserve", "poolId", "status", "tokenAssetId", "tokenReserve"].sort()
    );
  });

  test("rejects duplicate pool, missing asset, and unbalanced zero deposit", () => {
    const { state, user } = fundedUser();
    const create = signedAmm(user.privateKey, user.address, "ammCreatePool", 0, {
      tokenAssetId: TOKEN,
      tokenAmount: 20_000,
      nativeAmount: 20_000
    });
    applyTransaction(state, create, DEFAULT_CONFIG);
    expect(() =>
      applyTransaction(
        state,
        signedAmm(user.privateKey, user.address, "ammCreatePool", 1, {
          tokenAssetId: TOKEN,
          tokenAmount: 20_000,
          nativeAmount: 20_000
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/already exists/);
    expect(() =>
      applyTransaction(
        state,
        signedAmm(user.privateKey, user.address, "ammCreatePool", 1, {
          tokenAssetId: "missing",
          tokenAmount: 20_000,
          nativeAmount: 20_000
        }),
        DEFAULT_CONFIG
      )
    ).toThrow(/not found/i);
    expect(() => bootstrapLpShares(state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!)).not.toThrow();
  });
});
