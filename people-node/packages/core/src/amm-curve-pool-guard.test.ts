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
  registerAsset,
  setAccountBalance,
  signTransaction
} from "./index.js";
import type { NetworkConfig } from "@people/protocol";

/**
 * M13-1: a manual TOKEN/PPL pool created while the bonding curve is still live
 * made `executeMigration` pour the whole migration into that pool at a price its
 * LPs picked, and hand the surplus to them. From the security-upgrade height on,
 * such a pool cannot be created at all; below it the old behaviour is kept so
 * historical blocks (live manual pools: trosc, tpitp, tmark …) still validate.
 */

const TOKEN = "gold";

const upgradeConfig = (height: number): NetworkConfig => ({
  ...DEFAULT_CONFIG,
  securityUpgrade: { height, validatorAllowlist: [] }
});

function setup() {
  const state = createInitialState();
  const user = generateKeyPair();
  const account = ensureAccount(state, user.address);
  account.balance = 1_000_000;
  account.balances[NATIVE_ASSET_ID] = 1_000_000;
  registerAsset(state, {
    assetId: TOKEN,
    type: "user",
    name: TOKEN,
    symbol: TOKEN.toUpperCase(),
    decimals: 6,
    totalSupply: 1_000_000_000_000,
    creator: user.address,
    status: "active"
  });
  setAccountBalance(account, TOKEN, 500_000);
  return { state, user };
}

function liveCurve() {
  return {
    nativeScale: PPL_SCALE,
    assetId: TOKEN,
    initialCurveAllocation: 600,
    currentTokenReserve: 200,
    virtualTokenReserve: 200,
    virtualNativeReserve: 180,
    actualNativeReserve: 120.5,
    invariantK: String(600n * 60n),
    initialPriceReference: 1,
    status: "active" as const,
    migrationThreshold: 200
  };
}

function createPool(from: string, privateKey: string, nonce = 0) {
  return signTransaction(privateKey, {
    chainId: DEFAULT_CONFIG.chainId,
    id: `${from}-create-${nonce}`,
    from,
    to: "amm",
    amount: 0,
    fee: DEFAULT_TRANSFER_FEE,
    nonce,
    timestamp: 1,
    type: "ammCreatePool",
    payload: { tokenAssetId: TOKEN, tokenAmount: 90_000, nativeAmount: 30_000 }
  }, true);
}

describe("ammCreatePool vs a live bonding curve (M13-1)", () => {
  test("after the upgrade height a pool cannot be created while the curve is active", () => {
    const { state, user } = setup();
    state.curves[TOKEN] = liveCurve();
    expect(() =>
      applyTransaction(state, createPool(user.address, user.privateKey), upgradeConfig(1))
    ).toThrow(/Pool cannot be created while the bonding curve is active/);
    // Nothing was charged and no pool exists.
    expect(state.liquidityPools[nativeLiquidityPoolId(TOKEN)]).toBeUndefined();
    expect(state.accounts[user.address]!.balance).toBe(1_000_000);
    expect(state.accounts[user.address]!.nonce).toBe(0);
  });

  test("after the migration the pool belongs to the curve and cannot be re-created", () => {
    const { state, user } = setup();
    state.curves[TOKEN] = liveCurve();
    state.liquidityReserves[TOKEN] = 100;
    executeMigration(state, TOKEN, 9);
    expect(state.curves[TOKEN]!.status).toBe("migrated");
    expect(() =>
      applyTransaction(state, createPool(user.address, user.privateKey), upgradeConfig(1))
    ).toThrow(/Pool already exists/);
  });

  test("a token without a curve is unaffected by the rule", () => {
    const { state, user } = setup();
    applyTransaction(state, createPool(user.address, user.privateKey), upgradeConfig(1));
    const pool = state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!;
    expect(pool.tokenReserve).toBe(90_000);
    expect(pool.nativeReserve).toBe(30_000);
  });

  test("below the upgrade height the old behaviour is unchanged", () => {
    const { state, user } = setup();
    state.curves[TOKEN] = liveCurve();
    // Head height is 0, so the included block is height 1: an upgrade at 50 is not active yet.
    applyTransaction(state, createPool(user.address, user.privateKey), upgradeConfig(50));
    expect(state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!.tokenReserve).toBe(90_000);
  });

  test("without a security upgrade configured the old behaviour is unchanged", () => {
    const { state, user } = setup();
    state.curves[TOKEN] = liveCurve();
    applyTransaction(state, createPool(user.address, user.privateKey), DEFAULT_CONFIG);
    expect(state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!.tokenReserve).toBe(90_000);
  });

  test("control: a migration with no pre-existing pool writes the locked pool itself", () => {
    const state = createInitialState();
    state.curves[TOKEN] = liveCurve();
    state.liquidityReserves[TOKEN] = 100;
    executeMigration(state, TOKEN, 9);
    const pool = state.liquidityPools[nativeLiquidityPoolId(TOKEN)]!;
    expect(pool.locked).toBe(true);
    expect(pool.nativeReserve).toBe(120.5);
    expect(pool.tokenReserve).toBeGreaterThan(0);
    expect(pool.lpBalances).toBeUndefined();
  });
});
