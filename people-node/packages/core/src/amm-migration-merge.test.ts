import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  DEFAULT_TRANSFER_FEE,
  NATIVE_ASSET_ID,
  PPL_SCALE,
  applyTransaction,
  createInitialState,
  ensureAccount,
  executeMigration,
  generateKeyPair,
  nativeLiquidityPoolId,
  quoteAmmSwap,
  registerAsset,
  setAccountBalance,
  signTransaction
} from "./index.js";

const TOKEN = "gold";

/** Live manual pools on people-public-testnet-v2 (legacy + v2 symbols). */
const MANUAL_POOL_ASSETS = ["trosc", "tpitp", "tmark", "trosc2", "tpitp2", "tmark2"] as const;

function setup(assetId = TOKEN) {
  const state = createInitialState();
  const user = generateKeyPair();
  const account = ensureAccount(state, user.address);
  account.balance = 1_000_000;
  account.balances[NATIVE_ASSET_ID] = 1_000_000;
  registerAsset(state, {
    assetId,
    type: "user",
    name: assetId,
    symbol: assetId.toUpperCase(),
    decimals: 6,
    totalSupply: 1_000_000_000_000,
    creator: user.address,
    status: "active"
  });
  setAccountBalance(account, assetId, 500_000);
  return { state, user, assetId };
}

function amm(
  privateKey: string,
  from: string,
  type: "ammCreatePool" | "ammRemoveLiquidity" | "ammSwap",
  nonce: number,
  payload: Record<string, unknown>,
  amount = 0
) {
  return signTransaction(privateKey, {
    chainId: DEFAULT_CONFIG.chainId,
    id: `${from}-${type}-${nonce}`,
    from,
    to: "amm",
    amount,
    fee: DEFAULT_TRANSFER_FEE,
    nonce,
    timestamp: 1,
    type,
    payload
  });
}

function curve(assetId: string, nativeScale?: number) {
  return {
    ...(nativeScale ? { nativeScale } : {}),
    assetId,
    initialCurveAllocation: 600,
    currentTokenReserve: 200,
    virtualTokenReserve: 200,
    virtualNativeReserve: 180,
    actualNativeReserve: nativeScale ? 120.5 : 120,
    invariantK: String(600n * 60n),
    initialPriceReference: 1,
    status: "active" as const,
    migrationThreshold: 200
  };
}

describe("curve migration into an existing manual pool", () => {
  for (const scale of [undefined, PPL_SCALE]) {
    test(`merges instead of overwriting (nativeScale=${scale ?? "legacy"})`, () => {
      const { state, user, assetId } = setup();
      applyTransaction(
        state,
        amm(user.privateKey, user.address, "ammCreatePool", 0, {
          tokenAssetId: assetId,
          tokenAmount: 90_000,
          nativeAmount: 30_000
        }),
        DEFAULT_CONFIG
      );
      const poolId = nativeLiquidityPoolId(assetId);
      const before = structuredClone(state.liquidityPools[poolId]!);
      const userLp = before.lpBalances![user.address]!;
      expect(userLp).toBeGreaterThan(0);

      state.curves[assetId] = curve(assetId, scale);
      state.liquidityReserves[assetId] = 100;
      executeMigration(state, assetId, 9);

      const pool = state.liquidityPools[poolId]!;
      expect(pool.tokenReserve).toBeGreaterThan(before.tokenReserve);
      expect(pool.nativeReserve).toBeCloseTo(before.nativeReserve + (scale ? 120.5 : 120), 6);
      expect(pool.lpBalances![user.address]).toBe(userLp);
      expect(pool.totalLpSupply!).toBeGreaterThan(before.totalLpSupply!);
      expect(pool.lockedLpSupply! - before.lockedLpSupply!).toBe(pool.totalLpSupply! - before.totalLpSupply!);
      expect(pool.status).toBe("active");
      expect(pool.locked).toBe(before.locked);
      expect(pool.nativeScale).toBe(scale);
      expect(state.curves[assetId]!.status).toBe("migrated");
      expect(state.curves[assetId]!.liquidityPoolId).toBe(poolId);

      const q = quoteAmmSwap(state, poolId, NATIVE_ASSET_ID, 300, assetId);
      applyTransaction(
        state,
        amm(user.privateKey, user.address, "ammSwap", 1, {
          tokenAssetId: assetId,
          tokenIn: NATIVE_ASSET_ID,
          tokenOut: assetId,
          amountIn: 300,
          minAmountOut: q.amountOut
        }, 300),
        DEFAULT_CONFIG
      );
      applyTransaction(
        state,
        amm(user.privateKey, user.address, "ammRemoveLiquidity", 2, {
          tokenAssetId: assetId,
          lpAmount: userLp
        }, userLp),
        DEFAULT_CONFIG
      );
      const after = state.liquidityPools[poolId]!;
      expect(after.lpBalances![user.address] ?? 0).toBe(0);
      expect(after.tokenReserve).toBeGreaterThan(0);
      expect(after.nativeReserve).toBeGreaterThan(0);
    });
  }

  test("without an existing pool, migration output shape is unchanged", () => {
    const state = createInitialState();
    state.curves[TOKEN] = curve(TOKEN);
    state.liquidityReserves[TOKEN] = 100;
    executeMigration(state, TOKEN, 9);
    const pool = state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!;
    expect(pool.locked).toBe(true);
    expect(pool.totalLpSupply).toBeUndefined();
    expect(pool.nativeReserve).toBe(120);
  });

  test.each(MANUAL_POOL_ASSETS)("manual pool id %s survives migration merge", (assetId) => {
    const { state, user } = setup(assetId);
    applyTransaction(
      state,
      amm(user.privateKey, user.address, "ammCreatePool", 0, {
        tokenAssetId: assetId,
        tokenAmount: 50_000,
        nativeAmount: 10_000
      }),
      DEFAULT_CONFIG
    );
    const poolId = nativeLiquidityPoolId(assetId);
    expect(poolId).toBe(`pool-ppl-${assetId}`);
    const userLp = state.liquidityPools[poolId]!.lpBalances![user.address]!;
    state.curves[assetId] = curve(assetId, PPL_SCALE);
    state.liquidityReserves[assetId] = 50;
    executeMigration(state, assetId, 42);
    const pool = state.liquidityPools[poolId]!;
    expect(pool.lpBalances![user.address]).toBe(userLp);
    expect(pool.tokenReserve).toBeGreaterThan(50_000);
  });
});
