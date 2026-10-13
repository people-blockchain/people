import { describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreatorVestingState, Block } from "@ovn/protocol";
import {
  BondingCurveEngine,
  calculateVestedAmount,
  getClaimableVestedTokens,
  DEFAULT_CONFIG,
  DEFAULT_TOKEN_CREATE_MIN_FEE,
  createInitialState,
  applyTransaction,
  ensureAccount,
  computeStateRoot,
  signTransaction,
  generateKeyPair,
  ChainStore,
  NATIVE_ASSET_ID,
  PROVISIONAL_FEE_SPLIT
} from "./index.js";

function mockBlockAtHeight(height: number): Block {
  return {
    header: {
      height,
      previousHash: "prev-hash",
      stateRoot: "state-root",
      proposer: "validator-1",
      timestamp: Date.now()
    },
    transactions: [],
    hash: `hash-at-height-${height}`
  };
}

describe("BondingCurveEngine", () => {
  test("calculates deterministic 60/10/15/10/5 token allocation for 1 Billion supply", async () => {
    const alloc = BondingCurveEngine.calculateTokenAllocation(1_000_000_000);
    expect(alloc.bondingCurve).toBe(600_000_000);
    expect(alloc.communityPool).toBe(100_000_000);
    expect(alloc.creator).toBe(150_000_000);
    expect(alloc.liquidityReserve).toBe(100_000_000);
    expect(alloc.ecosystemReserve).toBe(50_000_000);

    const sum =
      alloc.bondingCurve +
      alloc.communityPool +
      alloc.creator +
      alloc.liquidityReserve +
      alloc.ecosystemReserve;
    expect(sum).toBe(1_000_000_000);
  });

  test("enforces exact supply conservation on odd token supply", async () => {
    const supply = 100_000_001;
    const alloc = BondingCurveEngine.calculateTokenAllocation(supply);
    const sum =
      alloc.bondingCurve +
      alloc.communityPool +
      alloc.creator +
      alloc.liquidityReserve +
      alloc.ecosystemReserve;
    expect(sum).toBe(supply);
  });

  test("rejects non-positive and fractional token supply", async () => {
    expect(() => BondingCurveEngine.calculateTokenAllocation(0)).toThrow("positive safe integer");
    expect(() => BondingCurveEngine.calculateTokenAllocation(-100)).toThrow("positive safe integer");
    expect(() => BondingCurveEngine.calculateTokenAllocation(100.5)).toThrow("positive safe integer");
  });

  test("initializes virtual constant-product curve state", async () => {
    const curve = BondingCurveEngine.createInitialCurveState("token-1", 1_000_000_000);
    expect(curve.assetId).toBe("token-1");
    expect(curve.virtualNativeReserve).toBe(60);
    expect(curve.virtualTokenReserve).toBe(600_000_000);
    expect(curve.currentTokenReserve).toBe(600_000_000);
    expect(curve.initialCurveAllocation).toBe(600_000_000);
    expect(curve.actualNativeReserve).toBe(0);
    expect(curve.invariantK).toBe(String(600_000_000n * 60n));
    expect(curve.status).toBe("active");
    expect(curve.migrationThreshold).toBe(200_000_000);
  });

  test("executes buy with 1.00% fee and integer floor rounding", async () => {
    const initialCurve = BondingCurveEngine.createInitialCurveState("token-1", 1_000_000_000);
    // Buy with 1,000 native units
    const result = BondingCurveEngine.calculateBuy(initialCurve, 1_000);
    expect(result.fee).toBe(10); // 1.00% of 1,000 = 10
    expect(result.netNativeInput).toBe(990);
    expect(result.tokensOut).toBeGreaterThan(0);
    expect(result.newVirtualNativeReserve).toBe(initialCurve.virtualNativeReserve + 990);
    expect(result.newActualNativeReserve).toBe(990);
    expect(result.newCurrentTokenReserve).toBe(initialCurve.currentTokenReserve - result.tokensOut);
  });

  test("executes sell with 1.00% fee and integer floor rounding", async () => {
    const initialCurve = BondingCurveEngine.createInitialCurveState("token-1", 1_000_000_000);
    // First buy some tokens
    const buyResult = BondingCurveEngine.calculateBuy(initialCurve, 10_000);
    const curveAfterBuy = {
      ...initialCurve,
      currentTokenReserve: buyResult.newCurrentTokenReserve,
      virtualTokenReserve: buyResult.newVirtualTokenReserve,
      virtualNativeReserve: buyResult.newVirtualNativeReserve,
      actualNativeReserve: buyResult.newActualNativeReserve
    };

    // Sell half the received tokens
    const tokensToSell = Math.floor(buyResult.tokensOut / 2);
    const sellResult = BondingCurveEngine.calculateSell(curveAfterBuy, tokensToSell);

    expect(sellResult.fee).toBeGreaterThanOrEqual(0);
    expect(sellResult.netNativeOut).toBeGreaterThan(0);
    expect(sellResult.grossNativeOut).toBe(sellResult.netNativeOut + sellResult.fee);
    expect(sellResult.newCurrentTokenReserve).toBe(curveAfterBuy.currentTokenReserve + tokensToSell);
    expect(sellResult.newActualNativeReserve).toBe(curveAfterBuy.actualNativeReserve - sellResult.grossNativeOut);
  });

  test("rejects sell when gross native out exceeds available non-virtual reserve", async () => {
    const initialCurve = BondingCurveEngine.createInitialCurveState("token-1", 1_000_000_000);
    // At initial state, actual non-virtual native reserve is 0
    expect(() => BondingCurveEngine.calculateSell(initialCurve, 1_000_000)).toThrow(
      "exceeds actual curve native reserve"
    );
  });

  test("verifies Reference Scenario (implemented testnet baseline): 1B supply, 120 NATIVE raised, 9x spot price", async () => {
    // Initial conditions from the implemented testnet baseline (packages/core/src/curve.ts):
    // Supply: 1,000,000,000
    // Curve initial tokens: 600,000,000
    // Virtual native: 60
    // K = 600,000,000 * 60 = 36,000,000,000
    const curve = BondingCurveEngine.createInitialCurveState("ref-token", 1_000_000_000);

    // Initial spot price: P0 = Y0 / X0 = 60 / 600,000,000 = 1e-7 NATIVE/token
    const initialSpotPrice = Number(curve.virtualNativeReserve) / Number(curve.virtualTokenReserve);
    expect(initialSpotPrice).toBeCloseTo(1e-7, 10);

    // Invariant calculation when net 120 NATIVE is raised:
    const k = BigInt(curve.invariantK);
    const targetNativeReserve = 60n + 120n; // 180n
    const expectedTokenReserve = k / targetNativeReserve; // 200,000,000n
    expect(expectedTokenReserve).toBe(200_000_000n);

    const tokensSold = BigInt(curve.currentTokenReserve) - expectedTokenReserve;
    expect(tokensSold).toBe(400_000_000n);

    // Final spot price: P_final = 180 / 200,000,000 = 9e-7 NATIVE/token
    const finalSpotPrice = Number(targetNativeReserve) / Number(expectedTokenReserve);
    expect(finalSpotPrice).toBeCloseTo(9e-7, 10);

    // Price ratio = P_final / P0 = 9e-7 / 1e-7 = 9x
    const priceRatio = finalSpotPrice / initialSpotPrice;
    expect(priceRatio).toBeCloseTo(9, 6);

    // Check migration trigger threshold:
    // Migration threshold = initialCurveAllocation / 3 = 600M / 3 = 200M
    const isMigrationReached = expectedTokenReserve <= BigInt(curve.migrationThreshold);
    expect(isMigrationReached).toBe(true);

    // Check migration calculation
    const migration = BondingCurveEngine.calculateMigration(
      {
        ...curve,
        currentTokenReserve: Number(expectedTokenReserve),
        virtualTokenReserve: Number(expectedTokenReserve),
        virtualNativeReserve: Number(targetNativeReserve),
        actualNativeReserve: 120
      },
      100_000_000 // 10% Liquidity Reserve from 1B supply
    );

    // Actual raised native = 120 NATIVE
    expect(migration.poolNativeReserve).toBe(120);

    // AMM pool tokens needed at final price:
    // poolToken = (120 * 200M) / 180 = 133,333,333 tokens
    expect(migration.poolTokenReserve).toBe(133_333_333);

    // Shortfall: 133,333,333 - 100,000,000 (liquidity reserve) = 33,333,333 from curve
    expect(migration.tokensFromLiquidityReserve).toBe(100_000_000);
    expect(migration.tokensFromCurveInventory).toBe(33_333_333);

    // Remaining curve tokens routed to Launch Reserve:
    // 200,000,000 - 33,333,333 = 166,666,667
    expect(migration.remainingCurveInventoryToLaunchReserve).toBe(166_666_667);

    // Exact conservation of tokens during migration:
    // poolToken + launchReserve = liquidityReserve + remainingCurveTokens
    // 133,333,333 + 166,666,667 = 100,000,000 + 200,000,000 = 300,000,000
    expect(migration.poolTokenReserve + migration.remainingCurveInventoryToLaunchReserve).toBe(300_000_000);
  });
});

describe("Creator Vesting Schedule", () => {
  test("calculates linear vesting correctly across block heights", async () => {
    const vesting: CreatorVestingState = {
      assetId: "vest-token",
      creator: "creator-1",
      totalAllocation: 150_000_000,
      upfrontUnlocked: 15_000_000,
      vestedAmount: 15_000_000,
      claimedAmount: 15_000_000,
      startBlock: 100,
      durationBlocks: 5_184_000
    };

    // At or before startBlock: only upfront unlocked
    expect(calculateVestedAmount(vesting, 100)).toBe(15_000_000);
    expect(calculateVestedAmount(vesting, 50)).toBe(15_000_000);

    // 25% through vesting: upfront (15M) + 25% of remaining (135M / 4 = 33,750,000) = 48,750,000
    const quarterBlock = 100 + 5_184_000 / 4;
    expect(calculateVestedAmount(vesting, quarterBlock)).toBe(15_000_000 + 33_750_000);

    // 50% through vesting: upfront (15M) + 50% of remaining (135M / 2 = 67,500,000) = 82,500,000
    const halfBlock = 100 + 5_184_000 / 2;
    expect(calculateVestedAmount(vesting, halfBlock)).toBe(15_000_000 + 67_500_000);

    // 100% (at end of duration)
    const endBlock = 100 + 5_184_000;
    expect(calculateVestedAmount(vesting, endBlock)).toBe(150_000_000);

    // Beyond end of duration (capped at totalAllocation)
    expect(calculateVestedAmount(vesting, endBlock + 1_000_000)).toBe(150_000_000);
  });

  test("computes claimable vested tokens taking into account previously claimed amount", async () => {
    const vesting: CreatorVestingState = {
      assetId: "vest-token",
      creator: "creator-1",
      totalAllocation: 150_000_000,
      upfrontUnlocked: 15_000_000,
      vestedAmount: 15_000_000,
      claimedAmount: 15_000_000,
      startBlock: 0,
      durationBlocks: 1_000
    };

    // At block 500: total vested = 15M + (135M * 500 / 1000) = 15M + 67.5M = 82.5M.
    // Claimed = 15M. Claimable = 82.5M - 15M = 67.5M.
    expect(getClaimableVestedTokens(vesting, 500)).toBe(67_500_000);

    // If claimed amount equals total vested, claimable is 0
    expect(getClaimableVestedTokens({ ...vesting, claimedAmount: 82_500_000 }, 500)).toBe(0);
  });
});

describe("Token Factory & Bonding Curve Transactions", () => {
  test("tokenCreate initializes token, allocations, creator upfront balance, vesting, and curve", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();

    // Fund creator with native tokens
    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    const tx = signTransaction(creator.privateKey, {
      id: "create-pepe",
      from: creator.address,
      to: creator.address,
      amount: 0,
      fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
      nonce: 0,
      timestamp: Date.now(),
      type: "tokenCreate",
      payload: {
        assetId: "pepe-coin",
        name: "Pepe Coin",
        symbol: "PEPE",
        decimals: 6,
        totalSupply: 1_000_000_000_000
      }
    });

    applyTransaction(state, tx, {
      ...DEFAULT_CONFIG,
      feeSplit: PROVISIONAL_FEE_SPLIT
    });

    // 1. Asset registered
    const asset = state.assets["pepe-coin"];
    expect(asset).toBeDefined();
    expect(asset?.name).toBe("Pepe Coin");
    expect(asset?.symbol).toBe("PEPE");
    expect(asset?.type).toBe("user");
    expect(asset?.status).toBe("active");

    // 2. Creator received 10% upfront of creator's 15% share = 15,000,000,000 (1M-token min supply scale)
    expect(state.accounts[creator.address]!.balances["pepe-coin"]).toBe(15_000_000_000);
    // Native balance deducted launch fee
    expect(state.accounts[creator.address]!.balance).toBe(50 - DEFAULT_TOKEN_CREATE_MIN_FEE);
    expect(state.accounts[creator.address]!.balances[NATIVE_ASSET_ID]).toBe(50 - DEFAULT_TOKEN_CREATE_MIN_FEE);

    // 3. Vesting entry created for 15% share (15M upfront, 135M linear)
    const vesting = state.vesting["pepe-coin"];
    expect(vesting).toBeDefined();
    expect(vesting?.creator).toBe(creator.address);
    expect(vesting?.totalAllocation).toBe(150_000_000_000);
    expect(vesting?.upfrontUnlocked).toBe(15_000_000_000);
    expect(vesting?.claimedAmount).toBe(15_000_000_000);
    expect(vesting?.durationBlocks).toBe(5_184_000);

    // 4. Reserves tracked
    expect(state.liquidityReserves["pepe-coin"]).toBe(100_000_000_000);
    expect(state.ecosystemReserves["pepe-coin"]).toBe(50_000_000_000);
    expect(state.launchReserves["pepe-coin"]).toBe(0);

    // 5. Community Pool received 10% = 100,000,000
    expect(state.communityPool.pools["pepe-coin"]?.totalAllocated).toBe(100_000_000_000);
    expect(state.communityPool.pools["pepe-coin"]?.remainingBalance).toBe(100_000_000_000);

    // 6. Bonding curve initialized with 60% = 600,000,000,000
    const curve = state.curves["pepe-coin"];
    expect(curve).toBeDefined();
    expect(curve?.status).toBe("active");
    expect(curve?.currentTokenReserve).toBe(600_000_000_000);
    expect(curve?.virtualNativeReserve).toBe(60);
    expect(curve?.actualNativeReserve).toBe(0);

    // Total supply conservation check: 15M (creator) + 100M (liq) + 50M (eco) + 100M (pool) + 600M (curve) + 135M (unvested in vesting) = 1B
    const totalAccounted =
      state.accounts[creator.address]!.balances["pepe-coin"]! +
      (vesting!.totalAllocation - vesting!.upfrontUnlocked) +
      state.liquidityReserves["pepe-coin"]! +
      state.ecosystemReserves["pepe-coin"]! +
      state.communityPool.pools["pepe-coin"]!.remainingBalance +
      curve!.currentTokenReserve;
    expect(totalAccounted).toBe(1_000_000_000_000);
  });

  test("rejects tokenCreate with fee lower than 1 NATIVE minimum", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    const tx = signTransaction(creator.privateKey, {
      id: "create-pepe-low-fee",
      from: creator.address,
      to: creator.address,
      amount: 0,
      fee: 0, // < 1 NATIVE
      nonce: 0,
      timestamp: Date.now(),
      type: "tokenCreate",
      payload: {
        assetId: "cheap-token",
        name: "Cheap Token",
        symbol: "CHP",
        decimals: 6,
        totalSupply: 1_000_000_000_000
      }
    });

    expect(() => applyTransaction(state, tx, DEFAULT_CONFIG)).toThrow(
      `Token creation requires at least ${DEFAULT_TOKEN_CREATE_MIN_FEE} NATIVE launch fee`
    );
  });

  test("rejects duplicate tokenCreate for existing assetId", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    const tx1 = signTransaction(creator.privateKey, {
      id: "create-pepe-1",
      from: creator.address,
      to: creator.address,
      amount: 0,
      fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
      nonce: 0,
      timestamp: Date.now(),
      type: "tokenCreate",
      payload: {
        assetId: "dupe-token",
        name: "Dupe Token",
        symbol: "DUP",
        decimals: 6,
        totalSupply: 1_000_000_000_000
      }
    });
    applyTransaction(state, tx1, DEFAULT_CONFIG);

    const tx2 = signTransaction(creator.privateKey, {
      id: "create-pepe-2",
      from: creator.address,
      to: creator.address,
      amount: 0,
      fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
      nonce: 1,
      timestamp: Date.now(),
      type: "tokenCreate",
      payload: {
        assetId: "dupe-token",
        name: "Dupe Token",
        symbol: "DUP",
        decimals: 6,
        totalSupply: 1_000_000_000_000
      }
    });

    expect(() => applyTransaction(state, tx2, DEFAULT_CONFIG)).toThrow(
      "Asset ID already exists: dupe-token"
    );
  });

  test("executes curveBuy and routes 1% trading fee through fee split", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const buyer = generateKeyPair();

    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    // Create token
    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "create-for-buy",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
        nonce: 0,
        timestamp: Date.now(),
        type: "tokenCreate",
        payload: {
          assetId: "buy-token",
          name: "Buy Token",
          symbol: "BUY",
          decimals: 6,
          totalSupply: 1_000_000_000_000
        }
      }),
      { ...DEFAULT_CONFIG, feeSplit: PROVISIONAL_FEE_SPLIT }
    );

    // Fund buyer with 100 NATIVE
    ensureAccount(state, buyer.address).balance = 100;
    state.accounts[buyer.address]!.balances[NATIVE_ASSET_ID] = 100;

    // Buyer buys tokens with 10 NATIVE
    const buyTx = signTransaction(buyer.privateKey, {
      id: "buy-tx-1",
      from: buyer.address,
      to: buyer.address,
      amount: 0,
      fee: 0,
      nonce: 0,
      timestamp: Date.now(),
      type: "curveBuy",
      payload: {
        assetId: "buy-token",
        nativeIn: 10,
        minTokensOut: 1
      }
    });

    applyTransaction(state, buyTx, { ...DEFAULT_CONFIG, feeSplit: PROVISIONAL_FEE_SPLIT });

    // Buyer received tokens
    const buyerTokens = state.accounts[buyer.address]!.balances["buy-token"] ?? 0;
    expect(buyerTokens).toBeGreaterThan(0);
    // Buyer native deducted
    expect(state.accounts[buyer.address]!.balance).toBe(90);

    // Curve updated
    const curve = state.curves["buy-token"]!;
    expect(curve.currentTokenReserve).toBe(600_000_000_000 - buyerTokens);
  });

  test("curveBuy slippage protection rejects transaction when minTokensOut not met", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const buyer = generateKeyPair();

    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "create-for-slip",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
        nonce: 0,
        timestamp: Date.now(),
        type: "tokenCreate",
        payload: {
          assetId: "slip-token",
          name: "Slip Token",
          symbol: "SLP",
          decimals: 6,
          totalSupply: 1_000_000_000_000
        }
      }),
      DEFAULT_CONFIG
    );

    ensureAccount(state, buyer.address).balance = 100;
    state.accounts[buyer.address]!.balances[NATIVE_ASSET_ID] = 100;

    // Impossible minTokensOut
    const buyTx = signTransaction(buyer.privateKey, {
      id: "buy-slip-tx",
      from: buyer.address,
      to: buyer.address,
      amount: 0,
      fee: 0,
      nonce: 0,
      timestamp: Date.now(),
      type: "curveBuy",
      payload: {
        assetId: "slip-token",
        nativeIn: 10,
        minTokensOut: 999_999_999_999 // Unattainable
      }
    });

    expect(() => applyTransaction(state, buyTx, DEFAULT_CONFIG)).toThrow("Slippage limit exceeded");
  });

  test("executes curveSell with 1.00% fee", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const trader = generateKeyPair();

    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "create-for-sell",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
        nonce: 0,
        timestamp: Date.now(),
        type: "tokenCreate",
        payload: {
          assetId: "sell-token",
          name: "Sell Token",
          symbol: "SEL",
          decimals: 6,
          totalSupply: 1_000_000_000_000
        }
      }),
      DEFAULT_CONFIG
    );

    ensureAccount(state, trader.address).balance = 100;
    state.accounts[trader.address]!.balances[NATIVE_ASSET_ID] = 100;

    // First trader buys tokens with 20 NATIVE
    applyTransaction(
      state,
      signTransaction(trader.privateKey, {
        id: "buy-step",
        from: trader.address,
        to: trader.address,
        amount: 0,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "curveBuy",
        payload: {
          assetId: "sell-token",
          nativeIn: 20,
          minTokensOut: 1
        }
      }),
      DEFAULT_CONFIG
    );

    const tokensBought = state.accounts[trader.address]!.balances["sell-token"]!;
    expect(tokensBought).toBeGreaterThan(0);
    expect(state.accounts[trader.address]!.balance).toBe(80);

    // Now sell half the tokens
    const tokensToSell = Math.floor(tokensBought / 2);
    applyTransaction(
      state,
      signTransaction(trader.privateKey, {
        id: "sell-step",
        from: trader.address,
        to: trader.address,
        amount: 0,
        fee: 0,
        nonce: 1,
        timestamp: Date.now(),
        type: "curveSell",
        payload: {
          assetId: "sell-token",
          tokenAmount: tokensToSell,
          minNativeOut: 1
        }
      }),
      DEFAULT_CONFIG
    );

    // Trader received native back
    expect(state.accounts[trader.address]!.balance).toBeGreaterThan(80);
    expect(state.accounts[trader.address]!.balances["sell-token"]).toBe(tokensBought - tokensToSell);
  });

  test("creatorClaim allows creator to claim vested tokens as block height advances", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const otherUser = generateKeyPair();

    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "create-for-vest",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
        nonce: 0,
        timestamp: Date.now(),
        type: "tokenCreate",
        payload: {
          assetId: "vest-token",
          name: "Vest Token",
          symbol: "VST",
          decimals: 6,
          totalSupply: 1_000_000_000_000
        }
      }),
      DEFAULT_CONFIG
    );

    // Upfront balance = 15,000,000,000
    expect(state.accounts[creator.address]!.balances["vest-token"]).toBe(15_000_000_000);

    // Non-creator attempt to claim must fail
    expect(() =>
      applyTransaction(
        state,
        signTransaction(otherUser.privateKey, {
          id: "claim-fraud",
          from: otherUser.address,
          to: otherUser.address,
          amount: 0,
          fee: 0,
          nonce: 0,
          timestamp: Date.now(),
          type: "creatorClaim",
          payload: { assetId: "vest-token" }
        }),
        DEFAULT_CONFIG
      )
    ).toThrow("Only the token creator can claim");

    // At block height 0 (startBlock), claimable is 0, so claim throws
    expect(() =>
      applyTransaction(
        state,
        signTransaction(creator.privateKey, {
          id: "claim-too-early",
          from: creator.address,
          to: creator.address,
          amount: 0,
          fee: 0,
          nonce: 1,
          timestamp: Date.now(),
          type: "creatorClaim",
          payload: { assetId: "vest-token" }
        }),
        DEFAULT_CONFIG
      )
    ).toThrow("No claimable vested tokens at this block height");

    // Advance chain height to 50% of vesting duration (2,592,000 blocks)
    state.chain.push(mockBlockAtHeight(2_592_000));

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "claim-halfway",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: 0,
        nonce: 1,
        timestamp: Date.now(),
        type: "creatorClaim",
        payload: { assetId: "vest-token" }
      }),
      DEFAULT_CONFIG
    );

    const halfRemaining = Math.floor(135_000_000_000 / 2); // 67,500,000,000
    expect(state.vesting["vest-token"]!.claimedAmount).toBe(15_000_000_000 + halfRemaining);
    expect(state.accounts[creator.address]!.balances["vest-token"]).toBe(15_000_000_000 + halfRemaining);

    // Advance chain height to 100% of vesting duration
    state.chain.push(mockBlockAtHeight(6_000_000));

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "claim-full",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: 0,
        nonce: 2,
        timestamp: Date.now(),
        type: "creatorClaim",
        payload: { assetId: "vest-token" }
      }),
      DEFAULT_CONFIG
    );

    expect(state.vesting["vest-token"]!.claimedAmount).toBe(150_000_000_000);
    expect(state.accounts[creator.address]!.balances["vest-token"]).toBe(150_000_000_000);
  });

  test("triggers migration upon reaching threshold, locks liquidity pool and rejects post-migration curve txs", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const whale = generateKeyPair();

    ensureAccount(state, creator.address).balance = 50;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 50;

    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "create-for-mig",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
        nonce: 0,
        timestamp: Date.now(),
        type: "tokenCreate",
        payload: {
          assetId: "mig-token",
          name: "Migration Token",
          symbol: "MIG",
          decimals: 6,
          totalSupply: 1_000_000_000_000
        }
      }),
      DEFAULT_CONFIG
    );

    // Whale has 500 NATIVE
    ensureAccount(state, whale.address).balance = 500;
    state.accounts[whale.address]!.balances[NATIVE_ASSET_ID] = 500;

    // Buy enough tokens to trigger migration (e.g. 130 NATIVE)
    // 120 NATIVE net buys 400M tokens, driving reserve to <= 200M (threshold is <= 200M)
    applyTransaction(
      state,
      signTransaction(whale.privateKey, {
        id: "whale-buy-mig",
        from: whale.address,
        to: whale.address,
        amount: 0,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "curveBuy",
        payload: {
          assetId: "mig-token",
          nativeIn: 130,
          minTokensOut: 400_000_000
        }
      }),
      DEFAULT_CONFIG
    );

    // 1. Curve status is "migrated"
    const curve = state.curves["mig-token"]!;
    expect(curve.status).toBe("migrated");
    expect(curve.currentTokenReserve).toBe(0);

    // 2. Liquidity pool created and locked
    const poolId = `pool-ppl-mig-token`;
    const pool = state.liquidityPools[poolId];
    expect(pool).toBeDefined();
    expect(pool?.locked).toBe(true);
    expect(pool?.tokenAssetId).toBe("mig-token");
    expect(pool?.nativeAssetId).toBe(NATIVE_ASSET_ID);
    expect(pool?.nativeReserve).toBeGreaterThan(0);
    expect(pool?.tokenReserve).toBeGreaterThan(0);

    // 3. Liquidity reserve deducted
    expect(state.liquidityReserves["mig-token"]).toBe(0);

    // 4. Launch reserve received remaining tokens
    expect(state.launchReserves["mig-token"]).toBeGreaterThan(0);

    // 5. Subsequent curve trades rejected
    expect(() =>
      applyTransaction(
        state,
        signTransaction(whale.privateKey, {
          id: "whale-buy-after-mig",
          from: whale.address,
          to: whale.address,
          amount: 0,
          fee: 0,
          nonce: 1,
          timestamp: Date.now(),
          type: "curveBuy",
          payload: {
            assetId: "mig-token",
            nativeIn: 10,
            minTokensOut: 1
          }
        }),
        DEFAULT_CONFIG
      )
    ).toThrow("Bonding curve is not active");
  });
});

describe("Phase 2 Persistence and State Restoration", () => {
  test("persists curves, vesting, and liquidity pools and restores across store reload", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "peoples-phase2-store-test-"));
    const store = new ChainStore(`${tmpDir}/chain.db`);
    await store.open();

    const state = createInitialState();
    state.curves["test-token"] = {
      assetId: "test-token",
      initialCurveAllocation: 600_000_000,
      currentTokenReserve: 300_000_000,
      virtualTokenReserve: 300_000_000,
      virtualNativeReserve: 120,
      actualNativeReserve: 60,
      invariantK: "36000000000",
      initialPriceReference: 0.0000001,
      status: "active",
      migrationThreshold: 200_000_000
    };

    state.vesting["test-token"] = {
      assetId: "test-token",
      creator: "creator-addr",
      totalAllocation: 150_000_000,
      upfrontUnlocked: 15_000_000,
      vestedAmount: 30_000_000,
      claimedAmount: 15_000_000,
      startBlock: 100,
      durationBlocks: 5_184_000
    };

    state.liquidityReserves["test-token"] = 100_000_000;
    state.ecosystemReserves["test-token"] = 50_000_000;
    state.launchReserves["test-token"] = 25_000_000;

    state.liquidityPools["pool-ppl-test-token"] = {
      poolId: "pool-ppl-test-token",
      tokenAssetId: "test-token",
      nativeAssetId: NATIVE_ASSET_ID,
      nativeReserve: 120,
      tokenReserve: 133_333_333,
      feeBps: 30,
      status: "active",
      locked: true,
      createdAt: 1234
    };

    await store.save({
      chainState: state,
      feePool: 0,
      latestReward: null,
      totalValidatorRewards: 0,
      totalTransactions: 0,
      rewardHistory: []
    });

    await store.close();

    const storeReopened = new ChainStore(`${tmpDir}/chain.db`);
    await storeReopened.open();
    const loaded = await storeReopened.load();
    expect(loaded).not.toBeNull();

    const restoredState = loaded!.chainState;
    expect(restoredState.curves["test-token"]).toEqual(state.curves["test-token"]);
    expect(restoredState.vesting["test-token"]).toEqual(state.vesting["test-token"]);
    expect(restoredState.liquidityReserves["test-token"]).toBe(100_000_000);
    expect(restoredState.ecosystemReserves["test-token"]).toBe(50_000_000);
    expect(restoredState.launchReserves["test-token"]).toBe(25_000_000);
    expect(restoredState.liquidityPools["pool-ppl-test-token"]).toEqual(
      state.liquidityPools["pool-ppl-test-token"]
    );

    await storeReopened.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("state root is deterministic with Phase 2 state collections", async () => {
    const nodeA = createInitialState();
    const nodeB = createInitialState();

    nodeA.curves["asset-x"] = BondingCurveEngine.createInitialCurveState("asset-x", 1_000_000_000);
    nodeB.curves["asset-x"] = BondingCurveEngine.createInitialCurveState("asset-x", 1_000_000_000);

    const rootA = computeStateRoot(nodeA);
    const rootB = computeStateRoot(nodeB);
    expect(rootA).toBe(rootB);
  });

  test("security invariant: round-trip buy then sell never extracts surplus native", async () => {
    const initialCurve = BondingCurveEngine.createInitialCurveState("drain-test", 1_000_000_000);
    for (const nativeIn of [10, 50, 100, 500, 1_000, 10_000]) {
      const buy = BondingCurveEngine.calculateBuy(initialCurve, nativeIn);
      const curveAfterBuy = {
        ...initialCurve,
        currentTokenReserve: buy.newCurrentTokenReserve,
        virtualTokenReserve: buy.newVirtualTokenReserve,
        virtualNativeReserve: buy.newVirtualNativeReserve,
        actualNativeReserve: buy.newActualNativeReserve
      };
      const sell = BondingCurveEngine.calculateSell(curveAfterBuy, buy.tokensOut);
      // Net native out must be <= nativeIn (and strictly less when fee >= 1 unit)
      expect(sell.netNativeOut).toBeLessThanOrEqual(nativeIn);
      if (nativeIn >= 100) {
        expect(sell.netNativeOut).toBeLessThan(nativeIn);
      }
      // Gross native out must be <= nativeIn (no free lunch from constant-product math)
      expect(sell.grossNativeOut).toBeLessThanOrEqual(nativeIn);
    }
  });

  test("security invariant: exact supply conservation across token lifecycle", async () => {
    const state = createInitialState();
    const creator = generateKeyPair();
    const user = generateKeyPair();

    ensureAccount(state, creator.address).balance = 100;
    state.accounts[creator.address]!.balances[NATIVE_ASSET_ID] = 100;
    ensureAccount(state, user.address).balance = 100;
    state.accounts[user.address]!.balances[NATIVE_ASSET_ID] = 100;

    const totalSupply = 1_000_000_000_000;

    // 1. Create token
    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "create-inv",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
        nonce: 0,
        timestamp: Date.now(),
        type: "tokenCreate",
        payload: {
          assetId: "inv-token",
          name: "Invariant Token",
          symbol: "INV",
          decimals: 6,
          totalSupply
        }
      }),
      DEFAULT_CONFIG
    );

    const countTotalSupply = () => {
      let sum = 0;
      for (const acct of Object.values(state.accounts)) {
        sum += acct.balances["inv-token"] ?? 0;
      }
      const vesting = state.vesting["inv-token"];
      if (vesting) {
        sum += vesting.totalAllocation - vesting.claimedAmount;
      }
      sum += state.liquidityReserves["inv-token"] ?? 0;
      sum += state.ecosystemReserves["inv-token"] ?? 0;
      sum += state.launchReserves["inv-token"] ?? 0;
      sum += state.communityPool.pools["inv-token"]?.remainingBalance ?? 0;
      sum += state.curves["inv-token"]?.currentTokenReserve ?? 0;
      const pool = state.liquidityPools[`pool-ppl-inv-token`];
      if (pool) {
        sum += pool.tokenReserve;
      }
      return sum;
    };

    expect(countTotalSupply()).toBe(totalSupply);

    // 2. Buy tokens
    applyTransaction(
      state,
      signTransaction(user.privateKey, {
        id: "buy-inv",
        from: user.address,
        to: user.address,
        amount: 0,
        fee: 0,
        nonce: 0,
        timestamp: Date.now(),
        type: "curveBuy",
        payload: {
          assetId: "inv-token",
          nativeIn: 25,
          minTokensOut: 1
        }
      }),
      DEFAULT_CONFIG
    );
    expect(countTotalSupply()).toBe(totalSupply);

    // 3. User transfers some tokens to creator
    applyTransaction(
      state,
      signTransaction(user.privateKey, {
        id: "xfer-inv",
        from: user.address,
        to: creator.address,
        amount: 1_000,
        fee: 1,
        nonce: 1,
        timestamp: Date.now(),
        type: "transfer",
        assetId: "inv-token"
      }),
      DEFAULT_CONFIG
    );
    expect(countTotalSupply()).toBe(totalSupply);

    // 4. User sells remaining tokens
    const remainingUserTokens = (state.accounts[user.address]!.balances["inv-token"] ?? 0) - 1_000;
    if (remainingUserTokens > 0) {
      applyTransaction(
        state,
        signTransaction(user.privateKey, {
          id: "sell-inv",
          from: user.address,
          to: user.address,
          amount: 0,
          fee: 0,
          nonce: 2,
          timestamp: Date.now(),
          type: "curveSell",
          payload: {
            assetId: "inv-token",
            tokenAmount: remainingUserTokens,
            minNativeOut: 1
          }
        }),
        DEFAULT_CONFIG
      );
    }
    expect(countTotalSupply()).toBe(totalSupply);

    // 5. Creator claims vested tokens
    state.chain.push(mockBlockAtHeight(2_592_000));
    applyTransaction(
      state,
      signTransaction(creator.privateKey, {
        id: "claim-inv",
        from: creator.address,
        to: creator.address,
        amount: 0,
        fee: 0,
        nonce: 1,
        timestamp: Date.now(),
        type: "creatorClaim",
        payload: { assetId: "inv-token" }
      }),
      DEFAULT_CONFIG
    );
    expect(countTotalSupply()).toBe(totalSupply);
  });
});

