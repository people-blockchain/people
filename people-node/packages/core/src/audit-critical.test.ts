import { afterEach, expect, test, vi } from "vitest";
import {
  DEFAULT_CONFIG, DEV_FAUCET_PRIVATE_KEY, FAUCET_ADDRESS, NATIVE_ASSET_ID,
  applyTransaction, buildBlock, contentTransactionId, createInitialState,
  distributeEpochRewards, enqueueTransaction, ensureAccount, generateKeyPair,
  computeStateRoot, signTransaction, validateAndReplayChain, validateBlock,
  tryApplyRemoteBlock, BondingCurveEngine, quoteAmmSwap, setAccountBalance,
  pplToAtoms, securityUpgradeActive, readSecurityUpgrade, calculateAddLiquidity, calculateRemoveLiquidity, type ChainState,
} from "./index.js";
import type { NetworkConfig, Transaction, CurveState, LiquidityPoolState } from "@ovn/protocol";

const bootstrap = generateKeyPair();
const config = (height = 1, addresses: string[] = []): NetworkConfig => ({
  ...DEFAULT_CONFIG, bootstrapAddress: bootstrap.address,
  securityUpgrade: { height, validatorAllowlist: addresses },
});
function tx(state: ChainState, type: Transaction["type"], changes: Partial<Transaction> = {}, key = DEV_FAUCET_PRIVATE_KEY) {
  return signTransaction(key, { id: "client-controlled-id", chainId: state.networkConfig!.chainId,
    from: FAUCET_ADDRESS, to: "network", amount: 0, fee: 0,
    nonce: state.accounts[FAUCET_ADDRESS]!.nonce, timestamp: 1, type, ...changes,
  }, true);
}
afterEach(() => vi.restoreAllMocks());

function applyCalculation(curve: CurveState, result: ReturnType<typeof BondingCurveEngine.calculateBuy> | ReturnType<typeof BondingCurveEngine.calculateSell>) {
  curve.currentTokenReserve = result.newCurrentTokenReserve;
  curve.virtualTokenReserve = result.newVirtualTokenReserve;
  curve.virtualNativeReserve = result.newVirtualNativeReserve;
  curve.actualNativeReserve = result.newActualNativeReserve;
}

test("C-01: empty allowlist rejects joins atomically; approved validator can join", async () => {
  const cfg = config(); const state = createInitialState(cfg);
  const join = tx(state, "joinValidator", { amount: 100, fee: 0.004875, payload: { nodeKind: "full" } });
  const before = structuredClone(state);
  expect(() => applyTransaction(state, join, cfg)).toThrow("allowlist");
  expect(state).toEqual(before);
  cfg.securityUpgrade!.validatorAllowlist = [FAUCET_ADDRESS];
  await applyTransaction(state, join, cfg);
  expect(state.validators[FAUCET_ADDRESS]!.status).toBe("joining");
});

test("C-02: a signed future block is rejected without changing the receiver", async () => {
  const cfg = config(); const producer = createInitialState(cfg); const receiver = structuredClone(producer);
  const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 3650 * 86400_000);
  const block = await buildBlock(producer, "bootstrap-validator", cfg, bootstrap.privateKey);
  vi.restoreAllMocks();
  expect(validateBlock(receiver.chain[0]!, block)).toBe(false);
  const before = structuredClone(receiver);
  expect(await tryApplyRemoteBlock(receiver, block, config())).toBe(false);
  expect(receiver).toEqual(before);
});

test("C-02: slightly lagging clocks still produce a monotonically increasing timestamp", async () => {
  const cfg = config(); const state = createInitialState(cfg); const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  const first = await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  vi.spyOn(Date, "now").mockReturnValue(now - 1000);
  const next = await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  expect(next.header.timestamp).toBe(first.header.timestamp + 1);
  expect(validateBlock(first, next)).toBe(true);
});

test("C-03: active validators receive fees, never new issuance after activation", () => {
  const key = generateKeyPair(); const cfg = config(1, [key.address]); const state = createInitialState(cfg);
  ensureAccount(state, key.address);
  state.validators[key.address] = { address: key.address, nodeKind: "full", status: "active", stake: 100,
    uptimeScore: 1, attestationScore: 1, lastSeen: 1, joinedAtEpoch: 0 };
  const reward = distributeEpochRewards(state, cfg, 10);
  expect(reward.protocolIssuance).toBe(0);
  expect(reward.totalReward).toBe(10);
  expect(state.accounts[key.address]!.balance).toBe(10);
});

test("C-03: both new proposals and pre-upgrade proposals cannot re-enable issuance", async () => {
  const cfg = config(1, [FAUCET_ADDRESS]); const state = createInitialState(cfg);
  expect(() => applyTransaction(state, tx(state, "proposal", { payload: { params: { epochBaseIssuance: 9e15 } } }), cfg)).toThrow("issuance");
  state.validators[FAUCET_ADDRESS] = { address: FAUCET_ADDRESS, nodeKind: "full", status: "active", stake: 100,
    uptimeScore: 1, attestationScore: 1, lastSeen: 1, joinedAtEpoch: 0 };
  state.proposals.legacy = { id: "legacy", proposer: FAUCET_ADDRESS, createdEpoch: 0, status: "open",
    params: { epochBaseIssuance: 500 }, votesFor: 0, votesAgainst: 0, voters: [] };
  const before = structuredClone(state);
  expect(() => applyTransaction(state, tx(state, "vote", { payload: { proposalId: "legacy", support: true } }), cfg)).toThrow("issuance");
  expect(state).toEqual(before);
});

test("C-04: buying 1 PPL and selling 1 token cannot extract 1 PPL", () => {
  const curve = BondingCurveEngine.createInitialCurveState("test", 1_000_000_000, true);
  const buy = BondingCurveEngine.calculateBuy(curve, 1);
  expect(buy.fee).toBe(0.01);
  expect(buy.netNativeInput).toBe(0.99);
  applyCalculation(curve, buy);
  try {
    const sell = BondingCurveEngine.calculateSell(curve, 1);
    expect(sell.netNativeOut).toBeLessThan(0.00001);
    applyCalculation(curve, sell);
  } catch (error) { expect(String(error)).toMatch(/0 (gross|net) native/); }
  expect(curve.actualNativeReserve).toBeGreaterThan(0.98);
});

test("C-04: seeded round trips conserve native funds and never profit through rounding", () => {
  let random = 12345;
  for (let i = 0; i < 200; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const input = ((random % 20_000_000) + 10000) / 1_000_000;
    const curve = BondingCurveEngine.createInitialCurveState("test", 1_000_000_000, true);
    const buy = BondingCurveEngine.calculateBuy(curve, input);
    applyCalculation(curve, buy);
    expect(BigInt(curve.virtualTokenReserve) * BigInt(pplToAtoms(curve.virtualNativeReserve))).toBeGreaterThanOrEqual(BigInt(curve.invariantK));
    const sell = BondingCurveEngine.calculateSell(curve, buy.tokensOut);
    applyCalculation(curve, sell);
    expect(pplToAtoms(sell.netNativeOut)).toBeLessThanOrEqual(pplToAtoms(input) - pplToAtoms(buy.fee) - pplToAtoms(sell.fee));
    expect(pplToAtoms(input)).toBe(pplToAtoms(buy.fee) + pplToAtoms(sell.fee) + pplToAtoms(sell.netNativeOut) + pplToAtoms(curve.actualNativeReserve));
  }
});

test("C-04: sub-PPL fee rounds up to one atom; migration keeps fractional PPL tradable", async () => {
  const cfg = config(); const state = createInitialState(cfg);
  await applyTransaction(state, tx(state, "tokenCreate", { fee: 1.045005, payload: { name: "Test", symbol: "TEST", totalSupply: 1_000_000_000_000_000, decimals: 6, assetId: "audit-token" } }), cfg);
  const assetId = Object.keys(state.curves)[0]!;
  const tiny = BondingCurveEngine.calculateBuy(state.curves[assetId]!, 0.000101);
  expect(tiny.fee).toBe(0.000002);
  await applyTransaction(state, tx(state, "curveBuy", { amount: 125, payload: { assetId } }), cfg);
  const pool = Object.values(state.liquidityPools)[0]!;
  expect(pool.nativeScale).toBe(1_000_000);
  expect(pool.nativeReserve).toBe(123.75);
  const quote = quoteAmmSwap(state, pool.poolId, NATIVE_ASSET_ID, 0.1);
  expect(quote.amountOut).toBeGreaterThan(0);
  await applyTransaction(state, tx(state, "ammSwap", { amount: 0.1, fee: 0.004875, payload: { poolId: pool.poolId, tokenIn: NATIVE_ASSET_ID, amountIn: 0.1 } }), cfg);
  expect(state.liquidityPools[pool.poolId]!.nativeReserve).toBe(123.85);
});

test("C-05: 500 unfunded accounts cannot poison a large-state mempool", async () => {
  const state = createInitialState();
  for (let i = 0; i < 20000; i++) ensureAccount(state, `0x${i.toString(16).padStart(40, "0")}`);
  for (let i = 0; i < 500; i++) {
    const key = generateKeyPair();
    const junk = signTransaction(key.privateKey, { id: `junk-${i}`, from: key.address, to: FAUCET_ADDRESS,
      chainId: DEFAULT_CONFIG.chainId, amount: 5, fee: 0, nonce: 0, timestamp: 1, type: "transfer" });
    expect(() => enqueueTransaction(state, junk)).toThrow("Insufficient");
  }
  expect(state.mempool).toHaveLength(0);
  expect(Object.keys(state.accounts)).toHaveLength(20001);
  const block = await buildBlock(state, "bootstrap-validator", structuredClone(DEFAULT_CONFIG));
  expect(block.transactions).toHaveLength(0);
}, 20_000); // Includes 500 real signatures and a 20,000-account fixture.

test("C-05: duplicate sender nonces are rejected; token spending is checked without mutation", () => {
  const state = createInitialState();
  const first = signTransaction(DEV_FAUCET_PRIVATE_KEY, { id: "first", from: FAUCET_ADDRESS, to: generateKeyPair().address, amount: 1, fee: 0.004875, nonce: 0, timestamp: 1, type: "transfer" });
  enqueueTransaction(state, first);
  expect(() => enqueueTransaction(state, { ...first, id: "second" }, false)).toThrow("Sender already");
  const before = structuredClone(state);
  expect(() => enqueueTransaction(state, { ...first, id: "overspend", from: generateKeyPair().address, amount: 1e6 }, false)).toThrow("Insufficient");
  expect(state).toEqual(before);
});

test("C-07: content IDs bind sender, nonce, network and payload; arbitrary ID overwrite is impossible", async () => {
  const cfg = config(); const state = createInitialState(cfg);
  const proposal = tx(state, "proposal", { payload: { params: { minStake: 100 } } });
  await applyTransaction(state, proposal, cfg);
  const key = generateKeyPair(); ensureAccount(state, key.address); setAccountBalance(state.accounts[key.address]!, NATIVE_ASSET_ID, 1);
  const fake = signTransaction(key.privateKey, { ...proposal, from: key.address, nonce: 0 }, true);
  expect(fake.id).not.toBe(proposal.id);
  const before = structuredClone(state);
  expect(() => applyTransaction(state, { ...fake, id: proposal.id }, cfg)).toThrow("signed content");
  expect(state).toEqual(before);
  for (const change of [{ nonce: 100 }, { chainId: "other" }, { payload: { params: { minStake: 1 } } }]) {
    expect(contentTransactionId({ ...proposal, ...change })).not.toBe(proposal.id);
  }
});

test("C-09: the approved fractional token launch fee counts one N epoch", async () => {
  const cfg = config(); const state = createInitialState(cfg);
  await applyTransaction(state, tx(state, "registerParticipant"), cfg);
  await applyTransaction(state, tx(state, "tokenCreate", { fee: 1.045005, payload: { name: "Test", symbol: "TEST", totalSupply: 1_000_000_000_000, decimals: 6 } }), cfg);
  expect(state.networkActivityEpochs[FAUCET_ADDRESS]).toEqual([1]);
});

test("upgrade preserves genesis and historical state roots; replay crosses the activation boundary", async () => {
  const legacy = { ...DEFAULT_CONFIG, bootstrapAddress: bootstrap.address };
  const scheduled = config(4);
  const state = createInitialState(legacy);
  expect(createInitialState(scheduled).chain[0]!.hash).toBe(state.chain[0]!.hash);
  enqueueTransaction(state, signTransaction(DEV_FAUCET_PRIVATE_KEY, { id: "legacy-transfer", from: FAUCET_ADDRESS, to: generateKeyPair().address, amount: 1, fee: 0, nonce: 0, timestamp: 1, type: "transfer" }));
  for (let i = 0; i < 3; i++) await buildBlock(state, "bootstrap-validator", legacy, bootstrap.privateKey);
  const oldArchive = structuredClone(state.chain);
  const oldReplay = await validateAndReplayChain(oldArchive, structuredClone(scheduled));
  expect(oldReplay).not.toBeNull();
  expect(computeStateRoot(oldReplay!)).toBe(state.chain.at(-1)!.header.stateRoot);
  state.networkConfig = structuredClone(scheduled);
  await buildBlock(state, "bootstrap-validator", scheduled, bootstrap.privateKey);
  expect(scheduled.epochBaseIssuance).toBe(0);
  const replay = await validateAndReplayChain(state.chain, config(4));
  expect(replay).not.toBeNull();
  expect(computeStateRoot(replay!)).toBe(state.chain.at(-1)!.header.stateRoot);
  expect(securityUpgradeActive(config(4), 3)).toBe(false);
  expect(securityUpgradeActive(config(4), 4)).toBe(true);
});

test("invalid activation configuration fails closed", () => {
  expect(() => readSecurityUpgrade({ SECURITY_UPGRADE_HEIGHT: "-1" })).toThrow();
  expect(() => readSecurityUpgrade({ SECURITY_UPGRADE_HEIGHT: "10", VALIDATOR_ALLOWLIST: "bad" })).toThrow();
  expect(readSecurityUpgrade({ SECURITY_UPGRADE_HEIGHT: "10" })).toEqual({ height: 10, validatorAllowlist: [] });
});

test("C-04: an existing curve upgrades on its first new trade and archive replay preserves both regimes", async () => {
  const cfg = config(4); const state = createInitialState(cfg);
  const create = tx(state, "tokenCreate", { fee: 1.045005, payload: { name: "Historical", symbol: "HIST", totalSupply: 1_000_000_000_000_000, decimals: 6 } });
  enqueueTransaction(state, create);
  await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  const assetId = Object.keys(state.curves)[0]!;
  expect(state.curves[assetId]!.nativeScale).toBeUndefined();
  enqueueTransaction(state, tx(state, "curveBuy", { amount: 10, payload: { assetId } }));
  await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  const oldK = BigInt(state.curves[assetId]!.invariantK);
  await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  enqueueTransaction(state, tx(state, "curveBuy", { amount: 0.2, payload: { assetId } }));
  const activated = await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  expect(activated.transactions).toHaveLength(1);
  expect(state.curves[assetId]!.nativeScale).toBe(1_000_000);
  expect(BigInt(state.curves[assetId]!.invariantK)).toBe(oldK * 1_000_000n);
  const replay = await validateAndReplayChain(state.chain, config(4));
  expect(replay).not.toBeNull();
  expect(replay!.curves).toEqual(state.curves);
  expect(computeStateRoot(replay!)).toBe(activated.header.stateRoot);
});

test("C-01: pre-upgrade joining validators outside the allowlist cannot activate later", async () => {
  const cfg = config(2); const state = createInitialState(cfg);
  enqueueTransaction(state, tx(state, "joinValidator", { amount: 100, payload: { nodeKind: "full" } }));
  await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  expect(state.validators[FAUCET_ADDRESS]!.status).toBe("joining");
  for (let i = 1; i < 30; i++) await buildBlock(state, "bootstrap-validator", cfg, bootstrap.privateKey);
  expect(state.validators[FAUCET_ADDRESS]!.status).toBe("joining");
});


test("C-04: LP mint/burn on a scaled pool conserves every native atom", () => {
  const pool: LiquidityPoolState = { poolId: "lp-audit", tokenAssetId: "token", nativeAssetId: NATIVE_ASSET_ID,
    tokenReserve: 0, nativeReserve: 0, feeBps: 30, nativeScale: 1_000_000, status: "active", locked: true, createdAt: 1 };
  const mint = calculateAddLiquidity(pool, 2_000_000, 1.5);
  const fundedPool = { ...pool, tokenReserve: mint.newTokenReserve, nativeReserve: mint.newNativeReserve,
    totalLpSupply: mint.newTotalLpSupply, lockedLpSupply: mint.lockedLpSupply };
  const burn = calculateRemoveLiquidity(fundedPool, mint.lpMinted);
  expect(burn.nativeOut).toBeGreaterThan(0);
  expect(burn.nativeOut).toBeLessThan(1.5);
  expect(pplToAtoms(burn.nativeOut) + pplToAtoms(burn.newNativeReserve)).toBe(1_500_000);
  expect(burn.tokenOut + burn.newTokenReserve).toBe(2_000_000);
  expect(burn.newTotalLpSupply).toBe(mint.lockedLpSupply);
});
