import { describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChainStore,
  LEGACY_NATIVE_ASSET_ID,
  NATIVE_ASSET_ID,
  NATIVE_ASSET_NAME,
  NATIVE_ASSET_SYMBOL,
  USER_PPL_COLLISION_ASSET_ID,
  canonicalizeAssetId,
  createInitialState,
  getAccountBalance,
  migrateLegacyNativeAssetState,
  nativeLiquidityPoolId
} from "./index.js";

describe("native asset People / PPL", () => {
  test("genesis registry is ppl / People / PPL and has no vls asset", async () => {
    const state = createInitialState();
    expect(NATIVE_ASSET_ID).toBe("ppl");
    expect(state.assets[NATIVE_ASSET_ID]?.name).toBe(NATIVE_ASSET_NAME);
    expect(state.assets[NATIVE_ASSET_ID]?.symbol).toBe(NATIVE_ASSET_SYMBOL);
    expect(state.assets[NATIVE_ASSET_ID]?.type).toBe("native");
    expect(state.assets.vls).toBeUndefined();
    const faucet = Object.values(state.accounts)[0]!;
    expect(faucet.balances[NATIVE_ASSET_ID]).toBe(faucet.balance);
    expect(faucet.balances.vls).toBeUndefined();
  });

  test("canonicalizeAssetId maps legacy vls to ppl", async () => {
    expect(canonicalizeAssetId("vls")).toBe("ppl");
    expect(canonicalizeAssetId("VLS")).toBe("ppl");
    expect(canonicalizeAssetId("ppl")).toBe("ppl");
    expect(canonicalizeAssetId("pep")).toBe("pep");
  });

  test("load-time migration remaps vls balances and registry without losing amounts", async () => {
    const state = createInitialState();
    const faucetAddr = Object.keys(state.accounts)[0]!;
    const amount = state.accounts[faucetAddr]!.balance;
    state.accounts[faucetAddr]!.balances = { vls: amount };
    state.assets = {
      vls: {
        assetId: "vls",
        type: "native",
        name: "Vallis",
        symbol: "VLS",
        decimals: 6,
        totalSupply: amount,
        creator: "genesis",
        status: "active"
      }
    };
    state.treasury = { vls: 20 };
    state.burned = { vls: 5 };
    state.communityPool = {
      pools: {
        vls: { assetId: "vls", totalAllocated: 10, totalDistributed: 2, remainingBalance: 8 }
      }
    };

    migrateLegacyNativeAssetState(state);

    expect(state.assets.vls).toBeUndefined();
    expect(state.assets.ppl?.symbol).toBe("PPL");
    expect(state.assets.ppl?.name).toBe("People");
    expect(state.accounts[faucetAddr]!.balances.ppl).toBe(amount);
    expect(state.accounts[faucetAddr]!.balances.vls).toBeUndefined();
    expect(getAccountBalance(state.accounts[faucetAddr]!, "vls")).toBe(amount);
    expect(state.treasury?.ppl).toBe(20);
    expect(state.treasury?.vls).toBeUndefined();
    expect(state.burned?.ppl).toBe(5);
    expect(state.communityPool.pools.ppl?.remainingBalance).toBe(8);
    expect(state.communityPool.pools.vls).toBeUndefined();
  });

  test("user token occupying ppl is rekeyed so native can take ppl", async () => {
    const state = createInitialState();
    const addr = Object.keys(state.accounts)[0]!;
    state.assets.vls = {
      ...state.assets.ppl!,
      assetId: "vls",
      name: "Vallis",
      symbol: "VLS"
    };
    delete state.assets.ppl;
    state.assets.ppl = {
      assetId: "ppl",
      type: "fungible",
      name: "User PPL",
      symbol: "PPL",
      decimals: 6,
      totalSupply: 9,
      creator: addr,
      status: "active"
    };
    state.accounts[addr]!.balance = 100;
    state.accounts[addr]!.balances = { vls: 100, ppl: 9 };

    migrateLegacyNativeAssetState(state);

    expect(state.assets.ppl?.type).toBe("native");
    expect(state.assets[USER_PPL_COLLISION_ASSET_ID]?.name).toBe("User PPL");
    expect(state.accounts[addr]!.balances.ppl).toBe(100);
    expect(state.accounts[addr]!.balances[USER_PPL_COLLISION_ASSET_ID]).toBe(9);
    expect(state.assets.vls).toBeUndefined();
  });

  test("AMM pool-vls-* keys remap to pool-ppl-*", async () => {
    const state = createInitialState();
    const legacyId = `pool-${LEGACY_NATIVE_ASSET_ID}-mig-token`;
    state.liquidityPools[legacyId] = {
      poolId: legacyId,
      tokenAssetId: "mig-token",
      nativeAssetId: LEGACY_NATIVE_ASSET_ID,
      tokenReserve: 1,
      nativeReserve: 2,
      feeBps: 30,
      status: "active",
      locked: true,
      createdAt: 1
    };
    state.curves["mig-token"] = {
      assetId: "mig-token",
      status: "migrated",
      liquidityPoolId: legacyId
    } as never;

    migrateLegacyNativeAssetState(state);

    const nextId = nativeLiquidityPoolId("mig-token");
    expect(state.liquidityPools[legacyId]).toBeUndefined();
    expect(state.liquidityPools[nextId]?.nativeAssetId).toBe(NATIVE_ASSET_ID);
    expect(state.curves["mig-token"]?.liquidityPoolId).toBe(nextId);
  });

  test("ChainStore load migrates a persisted vls snapshot", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "ppl-migrate-"));
    const dbPath = `${tmpDir}/chain.db`;
    const store = new ChainStore(dbPath);
    await store.open();
    const state = createInitialState();
    const addr = Object.keys(state.accounts)[0]!;
    const amount = state.accounts[addr]!.balance;
    state.assets.vls = {
      ...state.assets.ppl!,
      assetId: "vls",
      name: "Vallis",
      symbol: "VLS"
    };
    delete state.assets.ppl;
    state.accounts[addr]!.balances = { vls: amount };
    await store.save({
      chainState: state,
      feePool: 0,
      latestReward: null,
      totalValidatorRewards: 0,
      totalTransactions: 0,
      rewardHistory: []
    });
    await store.close();

    const reopened = new ChainStore(dbPath);
    await reopened.open();
    const loaded = await reopened.load();
    expect(loaded?.chainState.assets.ppl?.symbol).toBe("PPL");
    expect(loaded?.chainState.assets.vls).toBeUndefined();
    expect(loaded?.chainState.accounts[addr]!.balances.ppl).toBe(amount);
    expect(loaded?.chainState.accounts[addr]!.balances.vls).toBeUndefined();
    await reopened.close();
    await rm(tmpDir, { recursive: true, force: true });
  });
});
